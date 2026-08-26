import type { ContractValidationResult } from "../contracts/types.js";

export type ReportMode = "snapshot" | "deep-dive";
export type ReportingCadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "custom";

export interface ExplicitReportingPeriod {
  start: string;
  end: string;
  label?: string;
}

export interface ResolvedReportingPeriod {
  start: string;
  end: string;
  label: string;
  cadence: ReportingCadence;
  source: "explicit" | "inferred" | "default";
}

export interface ModeResolution {
  mode: ReportMode | undefined;
  source: "explicit" | "inferred" | "generate-now-default" | "unresolved";
  needsConfirmation: boolean;
}

export type SnapshotSectionRole =
  | "orientation"
  | "movement"
  | "attention"
  | "forward-view";

export interface StructureSection {
  key: string;
  role: SnapshotSectionRole;
  title: string;
}

export interface StructureResolution {
  sections: readonly StructureSection[];
  source: "user" | "remembered" | "agent-proposal" | "default-proposal";
  needsConfirmation: boolean;
}

export interface ConfirmationQuestion {
  id: "mode" | "audience" | "period" | "structure" | "ambiguous-evidence";
  prompt: string;
  options: string[];
  recommendation: string;
}

export interface ConfirmationPlan {
  questions: ConfirmationQuestion[];
  nextQuestion: ConfirmationQuestion | undefined;
  stoppedByGenerateNow: boolean;
  unresolvedEvidenceDisposition: "pending" | "omit";
}

export interface ResolvedReportRequest {
  mode: ModeResolution;
  audience: string;
  purpose: string;
  reportingPeriod: ResolvedReportingPeriod;
  requiresPersistenceSetup: false;
}

export interface ProposedSection {
  key: string;
  role: SnapshotSectionRole;
  title: string;
  summary: string;
  claimKeys: string[];
  workstreamProjectIds: string[];
}

export type ProposedClaimKind =
  | "outcome"
  | "decision"
  | "blocker"
  | "ask"
  | "priority"
  | "learning";

export interface ProposedClaim {
  key: string;
  kind: ProposedClaimKind;
  statement: string;
  implication: string;
  consequential: boolean;
  sourceIds: string[];
}

export type FixtureCaseCategory =
  | "strongly-evidenced-outcome"
  | "ambiguous-activity"
  | "blocker"
  | "explicit-ask"
  | "decision-with-rationale"
  | "next-period-priority"
  | "reusable-knowledge-note"
  | "duplicated-or-superseded-memory"
  | "malicious-html"
  | "fake-credential"
  | "absolute-path-sentinel";

export type CaseDisposition = "include" | "confirm" | "omit" | "memory-only" | "exclude";

export interface ProposalCaseHandling {
  caseId: string;
  category: FixtureCaseCategory;
  disposition: CaseDisposition;
  reason: string;
  claimKey?: string;
}

export interface AgentReportProposal {
  schemaVersion: "1.0.0";
  mode: "snapshot";
  workspaceId: string;
  audience: string;
  purpose: string;
  reportingPeriod: {
    start: string;
    end: string;
    label: string;
  };
  generateNow: boolean;
  sections: ProposedSection[];
  claims: ProposedClaim[];
  caseHandling: ProposalCaseHandling[];
}

export type ProposalValidationResult = ContractValidationResult;
