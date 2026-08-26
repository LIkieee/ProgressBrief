import { assertValidReportModel } from "./report-semantics.js";
import type {
  PublicEvidenceSource,
  ReportExportProjection,
  ReportSourceModel,
} from "./types.js";

const ABSOLUTE_LOCAL_PATH = /(?:^|[\s"'(])(?:\/(?!\/)(?:[^/\s"'<>]+\/)+[^/\s"'<>]+|[A-Za-z]:\\[^\s"'<>]+(?:\\[^\s"'<>]+)+)(?:$|[\s"',;)])/u;
const SUSPECTED_CREDENTIAL = /\b(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{20,}\b|\bAKIA[0-9A-Z]{16}\b/u;

function publicEvidenceSource(source: ReportSourceModel["evidence"]["sources"][number]): PublicEvidenceSource {
  return {
    id: source.id,
    workspaceId: source.workspaceId,
    ...(source.projectIds === undefined ? {} : { projectIds: structuredClone(source.projectIds) }),
    kind: source.kind,
    title: source.title,
    publicLabel: source.publicLabel,
    observedAt: source.observedAt,
    summary: source.summary,
  };
}

function inspectExportValue(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (ABSOLUTE_LOCAL_PATH.test(value)) {
      throw new Error(`Export blocked: absolute local path detected at ${path}.`);
    }
    if (SUSPECTED_CREDENTIAL.test(value)) {
      throw new Error(`Export blocked: suspected credential detected at ${path}.`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectExportValue(item, `${path}/${String(index)}`));
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "creatorOnly" || key === "creatorOnlyPath") {
        throw new Error(`Export blocked: creator-only field detected at ${path}/${key}.`);
      }
      inspectExportValue(item, `${path}/${key}`);
    }
  }
}

export function assertExportProjectionSafe(projection: ReportExportProjection): void {
  inspectExportValue(projection, "report");
}

export function projectReportForExport(document: unknown): ReportExportProjection {
  assertValidReportModel(document);

  const report = document;
  const projection: ReportExportProjection = {
    schemaVersion: report.schemaVersion,
    id: report.id,
    revision: report.revision,
    mode: report.mode,
    workspaceId: report.workspaceId,
    title: report.title,
    audience: report.audience,
    purpose: report.purpose,
    reportingPeriod: structuredClone(report.reportingPeriod),
    sections: structuredClone(report.sections),
    components: structuredClone(report.components),
    claims: structuredClone(report.claims),
    evidence: {
      schemaVersion: report.evidence.schemaVersion,
      workspaceId: report.evidence.workspaceId,
      sources: report.evidence.sources.map(publicEvidenceSource),
    },
    design: structuredClone(report.design),
    visualizations: structuredClone(report.visualizations),
    revisionHistory: structuredClone(report.revisionHistory),
  };

  assertExportProjectionSafe(projection);
  return projection;
}
