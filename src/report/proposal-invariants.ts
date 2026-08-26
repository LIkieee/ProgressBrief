import type { EvidenceBundle } from "../contracts/types.js";
import type {
  AgentReportProposal,
  FixtureCaseCategory,
  ProposalCaseHandling,
  ProposalValidationResult,
  ProposedClaimKind,
  SnapshotSectionRole,
} from "./types.js";

interface FixtureManifest {
  workstreams: Array<{ projectId: string }>;
  cases: Array<{ id: string; category: FixtureCaseCategory }>;
}

const REQUIRED_CASE_CLAIMS = new Map<FixtureCaseCategory, ProposedClaimKind>([
  ["strongly-evidenced-outcome", "outcome"],
  ["blocker", "blocker"],
  ["explicit-ask", "ask"],
  ["decision-with-rationale", "decision"],
  ["next-period-priority", "priority"],
]);

const SAFETY_CASES = new Set<FixtureCaseCategory>([
  "malicious-html",
  "fake-credential",
  "absolute-path-sentinel",
]);

const ABSOLUTE_LOCAL_PATH = /(?:^|[\s"'(])(?:\/(?:Users|home)\/[^\s"'<>]+|[A-Za-z]:\\[^\s"'<>]+)/u;
const SUSPECTED_CREDENTIAL = /\b(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{20,}\b|\bAKIA[0-9A-Z]{16}\b/u;
const ACTIVE_MARKUP = /<\s*(?:script|iframe|object|embed|svg)\b/iu;
const SECTION_ROLES = new Set(["orientation", "movement", "attention", "forward-view"]);
const CLAIM_KINDS = new Set(["outcome", "decision", "blocker", "ask", "priority", "learning"]);
const CASE_CATEGORIES = new Set([
  ...REQUIRED_CASE_CLAIMS.keys(),
  "ambiguous-activity",
  "reusable-knowledge-note",
  "duplicated-or-superseded-memory",
  ...SAFETY_CASES,
]);
const CASE_DISPOSITIONS = new Set(["include", "confirm", "omit", "memory-only", "exclude"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAgentReportProposal(value: unknown): value is AgentReportProposal {
  if (!isRecord(value) || !isRecord(value.reportingPeriod)) return false;
  if (
    value.schemaVersion !== "1.0.0" ||
    value.mode !== "snapshot" ||
    typeof value.workspaceId !== "string" ||
    typeof value.audience !== "string" ||
    value.audience.trim().length === 0 ||
    typeof value.purpose !== "string" ||
    value.purpose.trim().length === 0 ||
    typeof value.generateNow !== "boolean" ||
    typeof value.reportingPeriod.start !== "string" ||
    typeof value.reportingPeriod.end !== "string" ||
    typeof value.reportingPeriod.label !== "string" ||
    !Array.isArray(value.sections) ||
    !Array.isArray(value.claims) ||
    !Array.isArray(value.caseHandling)
  ) {
    return false;
  }

  const sectionsValid = value.sections.every(
    (section) =>
      isRecord(section) &&
      typeof section.key === "string" &&
      typeof section.role === "string" &&
      SECTION_ROLES.has(section.role) &&
      typeof section.title === "string" &&
      typeof section.summary === "string" &&
      isStringArray(section.claimKeys) &&
      isStringArray(section.workstreamProjectIds),
  );
  const claimsValid = value.claims.every(
    (claim) =>
      isRecord(claim) &&
      typeof claim.key === "string" &&
      typeof claim.kind === "string" &&
      CLAIM_KINDS.has(claim.kind) &&
      typeof claim.statement === "string" &&
      typeof claim.implication === "string" &&
      typeof claim.consequential === "boolean" &&
      isStringArray(claim.sourceIds),
  );
  const handlingValid = value.caseHandling.every(
    (handling) =>
      isRecord(handling) &&
      typeof handling.caseId === "string" &&
      typeof handling.category === "string" &&
      CASE_CATEGORIES.has(handling.category) &&
      typeof handling.disposition === "string" &&
      CASE_DISPOSITIONS.has(handling.disposition) &&
      typeof handling.reason === "string" &&
      (handling.claimKey === undefined || typeof handling.claimKey === "string"),
  );

  return sectionsValid && claimsValid && handlingValid;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function handlingFor(
  proposal: AgentReportProposal,
  category: FixtureCaseCategory,
): ProposalCaseHandling | undefined {
  return proposal.caseHandling.find((item) => item.category === category);
}

function unsafeExportableContent(proposal: AgentReportProposal): boolean {
  const serialized = JSON.stringify(proposal);
  return (
    ACTIVE_MARKUP.test(serialized) ||
    SUSPECTED_CREDENTIAL.test(serialized) ||
    ABSOLUTE_LOCAL_PATH.test(serialized)
  );
}

export function validateSnapshotProposal(
  proposal: unknown,
  manifest: FixtureManifest,
  evidence: EvidenceBundle,
): ProposalValidationResult {
  if (!isAgentReportProposal(proposal)) {
    return { valid: false, errors: ["The agent report proposal has an invalid shape."] };
  }

  const errors: string[] = [];
  const claimKeys = proposal.claims.map(({ key }) => key);
  const claims = new Map(proposal.claims.map((claim) => [claim.key, claim]));
  const knownSourceIds = new Set(evidence.sources.map(({ id }) => id));
  const expectedCases = new Map(manifest.cases.map((item) => [item.id, item.category]));

  if (proposal.schemaVersion !== "1.0.0" || proposal.mode !== "snapshot") {
    errors.push("The proposal must use the V1 Snapshot contract.");
  }
  if (proposal.workspaceId !== evidence.workspaceId) {
    errors.push("The proposal and evidence must stay inside one Workspace.");
  }
  if (proposal.reportingPeriod.start > proposal.reportingPeriod.end) {
    errors.push("The proposal reporting period is reversed.");
  }
  if (new Set(proposal.sections.map(({ key }) => key)).size !== proposal.sections.length) {
    errors.push("Proposal section keys must be unique.");
  }
  if (new Set(claimKeys).size !== claimKeys.length) {
    errors.push("Proposal claim keys must be unique.");
  }

  const sectionRoles = new Set(proposal.sections.map(({ role }) => role));
  const requiredRoles = new Set<SnapshotSectionRole>(["orientation"]);
  if (
    proposal.caseHandling.some(
      ({ category, disposition }) =>
        disposition === "include" &&
        (category === "strongly-evidenced-outcome" || category === "decision-with-rationale"),
    )
  ) {
    requiredRoles.add("movement");
  }
  if (
    proposal.caseHandling.some(
      ({ category, disposition }) =>
        disposition === "include" && (category === "blocker" || category === "explicit-ask"),
    )
  ) {
    requiredRoles.add("attention");
  }
  if (
    proposal.caseHandling.some(
      ({ category, disposition }) =>
        disposition === "include" && category === "next-period-priority",
    )
  ) {
    requiredRoles.add("forward-view");
  }
  for (const role of requiredRoles) {
    if (!sectionRoles.has(role)) errors.push(`The Snapshot proposal is missing ${role}.`);
  }

  const representedProjects = new Set(
    proposal.sections.flatMap(({ workstreamProjectIds }) => workstreamProjectIds),
  );
  for (const { projectId } of manifest.workstreams) {
    if (!representedProjects.has(projectId)) {
      errors.push(`The Snapshot structure omits fixture workstream ${projectId}.`);
    }
  }

  const referencedClaims = new Set<string>();
  for (const section of proposal.sections) {
    for (const claimKey of section.claimKeys) {
      referencedClaims.add(claimKey);
      if (!claims.has(claimKey)) errors.push(`Section ${section.key} references unknown claim ${claimKey}.`);
    }
  }

  for (const claim of proposal.claims) {
    if (claim.statement.trim().length === 0 || claim.implication.trim().length === 0) {
      errors.push(`Claim ${claim.key} requires a statement and implication.`);
    }
    if (claim.consequential && claim.sourceIds.length === 0) {
      errors.push(`The consequential claim ${claim.key} has no source.`);
    } else if (claim.sourceIds.length === 0) {
      errors.push(`Claim ${claim.key} has no source.`);
    }
    for (const sourceId of claim.sourceIds) {
      if (!knownSourceIds.has(sourceId)) errors.push(`Claim ${claim.key} references unknown source ${sourceId}.`);
    }
    if (!referencedClaims.has(claim.key)) errors.push(`Claim ${claim.key} is not assigned to a section.`);
  }

  const actualCases = new Map(proposal.caseHandling.map((item) => [item.caseId, item.category]));
  const caseIdsMatch =
    proposal.caseHandling.length === manifest.cases.length &&
    new Set(proposal.caseHandling.map(({ caseId }) => caseId)).size === manifest.cases.length &&
    JSON.stringify(sorted([...actualCases.keys()])) === JSON.stringify(sorted([...expectedCases.keys()])) &&
    [...expectedCases].every(([id, category]) => actualCases.get(id) === category);
  if (!caseIdsMatch) errors.push("Proposal case handling must cover exactly the fixture manifest.");

  for (const [category, requiredKind] of REQUIRED_CASE_CLAIMS) {
    const handling = handlingFor(proposal, category);
    const claim = handling?.claimKey === undefined ? undefined : claims.get(handling.claimKey);
    if (handling?.disposition !== "include" || claim?.kind !== requiredKind) {
      errors.push(`${category} must be included through a ${requiredKind} claim.`);
    }
  }

  const ambiguous = handlingFor(proposal, "ambiguous-activity");
  if (proposal.generateNow) {
    if (ambiguous?.disposition !== "omit") {
      errors.push("Generate now must omit ambiguous activity.");
    }
    if (proposal.caseHandling.some(({ disposition }) => disposition === "confirm")) {
      errors.push("Generate now cannot leave confirmation work pending.");
    }
  } else if (ambiguous?.disposition !== "confirm" && ambiguous?.disposition !== "omit") {
    errors.push("Ambiguous activity must be confirmed or omitted.");
  }

  const reusable = handlingFor(proposal, "reusable-knowledge-note");
  if (reusable?.disposition !== "memory-only" && reusable?.disposition !== "include") {
    errors.push("Reusable knowledge must be included when explanatory or retained as memory-only.");
  }
  if (reusable?.disposition === "include") {
    const claim = reusable.claimKey === undefined ? undefined : claims.get(reusable.claimKey);
    if (claim?.kind !== "learning") errors.push("Included reusable knowledge must map to a learning claim.");
  }

  const superseded = handlingFor(proposal, "duplicated-or-superseded-memory");
  if (superseded?.disposition !== "memory-only") {
    errors.push("Duplicated or superseded memory must preserve history as memory-only.");
  }

  for (const category of SAFETY_CASES) {
    if (handlingFor(proposal, category)?.disposition !== "exclude") {
      errors.push(`${category} must be excluded from exportable proposal content.`);
    }
  }
  if (unsafeExportableContent(proposal)) {
    errors.push("The proposal contains unsafe exportable content.");
  }

  return { valid: errors.length === 0, errors };
}
