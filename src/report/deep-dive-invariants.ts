import type { EvidenceBundle } from "../contracts/types.js";
import type {
  AgentDeepDiveProposal,
  ProposalValidationResult,
} from "./types.js";

const SECTION_ROLES = new Set([
  "context",
  "decision-path",
  "implementation",
  "validation",
  "implications",
]);
const CLAIM_KINDS = new Set([
  "outcome",
  "decision",
  "blocker",
  "ask",
  "priority",
  "learning",
]);
const ABSOLUTE_LOCAL_PATH = /(?:^|[\s"'(])(?:\/(?:Users|home)\/[^\s"'<>]+|[A-Za-z]:\\[^\s"'<>]+)/u;
const SUSPECTED_CREDENTIAL = /\b(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{20,}\b|\bAKIA[0-9A-Z]{16}\b/u;
const ACTIVE_MARKUP = /<\s*(?:script|iframe|object|embed|svg)\b/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isDeepDiveProposal(value: unknown): value is AgentDeepDiveProposal {
  if (!isRecord(value) || !isRecord(value.reportingPeriod)) return false;
  if (
    value.schemaVersion !== "1.0.0" ||
    value.mode !== "deep-dive" ||
    typeof value.workspaceId !== "string" ||
    !isStringArray(value.selectedProjectIds) ||
    value.selectedProjectIds.length === 0 ||
    typeof value.audience !== "string" ||
    value.audience.trim().length === 0 ||
    typeof value.purpose !== "string" ||
    value.purpose.trim().length === 0 ||
    typeof value.reportingPeriod.start !== "string" ||
    typeof value.reportingPeriod.end !== "string" ||
    typeof value.reportingPeriod.label !== "string" ||
    !Array.isArray(value.sections) ||
    value.sections.length === 0 ||
    !Array.isArray(value.claims) ||
    value.claims.length === 0
  ) {
    return false;
  }

  const sectionsValid = value.sections.every(
    (section) =>
      isRecord(section) &&
      typeof section.key === "string" &&
      section.key.trim().length > 0 &&
      typeof section.role === "string" &&
      SECTION_ROLES.has(section.role) &&
      typeof section.title === "string" &&
      section.title.trim().length > 0 &&
      typeof section.summary === "string" &&
      section.summary.trim().length > 0 &&
      isStringArray(section.claimKeys) &&
      isStringArray(section.projectIds) &&
      section.projectIds.length > 0,
  );
  const claimsValid = value.claims.every(
    (claim) =>
      isRecord(claim) &&
      typeof claim.key === "string" &&
      claim.key.trim().length > 0 &&
      typeof claim.kind === "string" &&
      CLAIM_KINDS.has(claim.kind) &&
      typeof claim.statement === "string" &&
      claim.statement.trim().length > 0 &&
      typeof claim.implication === "string" &&
      claim.implication.trim().length > 0 &&
      typeof claim.consequential === "boolean" &&
      isStringArray(claim.sourceIds),
  );
  return sectionsValid && claimsValid;
}

function hasUnsafeExportableContent(proposal: AgentDeepDiveProposal): boolean {
  const serialized = JSON.stringify(proposal);
  return (
    ACTIVE_MARKUP.test(serialized) ||
    SUSPECTED_CREDENTIAL.test(serialized) ||
    ABSOLUTE_LOCAL_PATH.test(serialized)
  );
}

export function validateDeepDiveProposal(
  proposal: unknown,
  evidence: EvidenceBundle,
): ProposalValidationResult {
  if (!isDeepDiveProposal(proposal)) {
    return { valid: false, errors: ["The Deep Dive proposal has an invalid shape."] };
  }

  const errors: string[] = [];
  const selectedProjects = new Set(proposal.selectedProjectIds);
  const knownSources = new Map(evidence.sources.map((source) => [source.id, source]));
  const claims = new Map(proposal.claims.map((claim) => [claim.key, claim]));
  const referencedClaims = new Set<string>();

  if (proposal.workspaceId !== evidence.workspaceId) {
    errors.push("The Deep Dive proposal and evidence must stay inside one Workspace.");
  }
  if (proposal.reportingPeriod.start > proposal.reportingPeriod.end) {
    errors.push("The Deep Dive reporting period is reversed.");
  }
  if (new Set(proposal.selectedProjectIds).size !== proposal.selectedProjectIds.length) {
    errors.push("Selected Deep Dive project IDs must be unique.");
  }
  if (new Set(proposal.sections.map(({ key }) => key)).size !== proposal.sections.length) {
    errors.push("Deep Dive section keys must be unique.");
  }
  if (new Set(proposal.claims.map(({ key }) => key)).size !== proposal.claims.length) {
    errors.push("Deep Dive claim keys must be unique.");
  }

  const representedProjects = new Set<string>();
  for (const section of proposal.sections) {
    for (const projectId of section.projectIds) {
      representedProjects.add(projectId);
      if (!selectedProjects.has(projectId)) {
        errors.push(`Section ${section.key} is outside the selected Deep Dive scope.`);
      }
    }
    for (const claimKey of section.claimKeys) {
      referencedClaims.add(claimKey);
      if (!claims.has(claimKey)) {
        errors.push(`Section ${section.key} references unknown claim ${claimKey}.`);
      }
    }
  }
  for (const projectId of selectedProjects) {
    if (!representedProjects.has(projectId)) {
      errors.push(`The Deep Dive structure omits selected project ${projectId}.`);
    }
    if (!evidence.sources.some(({ projectIds }) => projectIds?.includes(projectId) === true)) {
      errors.push(`Selected project ${projectId} has no evidence source.`);
    }
  }

  for (const claim of proposal.claims) {
    if (claim.consequential && claim.sourceIds.length === 0) {
      errors.push(`The consequential claim ${claim.key} has no source.`);
    } else if (claim.sourceIds.length === 0) {
      errors.push(`Claim ${claim.key} has no source.`);
    }
    if (!referencedClaims.has(claim.key)) {
      errors.push(`Claim ${claim.key} is not assigned to a Deep Dive section.`);
    }
    for (const sourceId of claim.sourceIds) {
      const source = knownSources.get(sourceId);
      if (source === undefined) {
        errors.push(`Claim ${claim.key} references unknown source ${sourceId}.`);
      } else if (!source.projectIds?.some((projectId) => selectedProjects.has(projectId))) {
        errors.push(`Claim ${claim.key} uses source ${sourceId} outside the selected project scope.`);
      }
    }
  }

  if (hasUnsafeExportableContent(proposal)) {
    errors.push("The Deep Dive proposal contains unsafe exportable content.");
  }

  return { valid: errors.length === 0, errors };
}
