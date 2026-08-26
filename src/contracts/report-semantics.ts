import { validateDocument } from "./schema-validator.js";
import type {
  ContractValidationResult,
  ReportSourceModel,
} from "./types.js";

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }

  return [...repeated];
}

function reportSemanticErrors(report: ReportSourceModel): string[] {
  const errors: string[] = [];
  const sourceIdValues = report.evidence.sources.map(({ id }) => id);
  const claimIdValues = report.claims.map(({ id }) => id);
  const componentIdValues = report.components.map(({ id }) => id);
  const sectionIdValues = report.sections.map(({ id }) => id);
  const visualizationIdValues = report.visualizations.map(({ id }) => id);
  const sourceIds = new Set(sourceIdValues);
  const claimIds = new Set(claimIdValues);
  const componentIds = new Set(componentIdValues);
  const sectionIds = new Set(sectionIdValues);
  const visualizationIds = new Set(visualizationIdValues);

  for (const [label, ids] of [
    ["source", sourceIdValues],
    ["claim", claimIdValues],
    ["component", componentIdValues],
    ["section", sectionIdValues],
    ["visualization", visualizationIdValues],
  ] as const) {
    for (const id of duplicates(ids)) errors.push(`Duplicate ${label} ID ${id}.`);
  }

  if (report.evidence.workspaceId !== report.workspaceId) {
    errors.push("The evidence bundle crosses workspace boundaries.");
  }

  for (const source of report.evidence.sources) {
    if (source.workspaceId !== report.workspaceId) {
      errors.push(`Source ${source.id} crosses workspace boundaries.`);
    }
  }

  for (const claim of report.claims) {
    for (const sourceId of claim.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        errors.push(`Claim ${claim.id} references unknown source ID ${sourceId}.`);
      }
    }
  }

  for (const section of report.sections) {
    for (const claimId of section.claimIds) {
      if (!claimIds.has(claimId)) {
        errors.push(`Section ${section.id} references unknown claim ID ${claimId}.`);
      }
    }
    for (const componentId of section.componentIds) {
      if (!componentIds.has(componentId)) {
        errors.push(`Section ${section.id} references unknown component ID ${componentId}.`);
      } else {
        const component = report.components.find(({ id }) => id === componentId);
        if (component?.sectionId !== section.id) {
          errors.push(`Component ${componentId} is assigned across section boundaries.`);
        }
      }
    }
  }

  for (const component of report.components) {
    if (!sectionIds.has(component.sectionId)) {
      errors.push(`Component ${component.id} references unknown section ID ${component.sectionId}.`);
    }
    if (
      component.visualizationId !== undefined &&
      !visualizationIds.has(component.visualizationId)
    ) {
      errors.push(
        `Component ${component.id} references unknown visualization ID ${component.visualizationId}.`,
      );
    }
  }

  for (const visualization of report.visualizations) {
    for (const claimId of visualization.claimIds) {
      if (!claimIds.has(claimId)) {
        errors.push(`Visualization ${visualization.id} references unknown claim ID ${claimId}.`);
      }
    }
  }

  for (const omission of report.creatorOnly.omissions) {
    for (const sourceId of omission.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        errors.push(`Creator-only omission references unknown source ID ${sourceId}.`);
      }
    }
  }

  const latestRevision = report.revisionHistory.at(-1)?.revision;
  if (latestRevision !== report.revision) {
    errors.push("The current revision does not match the latest revision history entry.");
  }

  report.revisionHistory.forEach((entry, index) => {
    if (entry.revision !== index + 1) {
      errors.push("Revision history must be contiguous and begin at revision 1.");
    }
  });

  if (report.reportingPeriod.start > report.reportingPeriod.end) {
    errors.push("The reporting period start must not follow its end.");
  }

  return errors;
}

export function validateReportModel(document: unknown): ContractValidationResult {
  const structural = validateDocument("report", document);
  if (!structural.valid) return structural;

  const errors = reportSemanticErrors(document as ReportSourceModel);
  return { valid: errors.length === 0, errors };
}

export function assertValidReportModel(document: unknown): asserts document is ReportSourceModel {
  const result = validateReportModel(document);
  if (!result.valid) {
    throw new Error(`Invalid report model: ${result.errors.join("; ")}`);
  }
}
