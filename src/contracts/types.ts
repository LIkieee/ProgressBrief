export interface RevisionHistoryEntry {
  revision: number;
  createdAt: string;
  summary: string;
}

export interface RevisionedDocument {
  id: string;
  revision: number;
  revisionHistory: RevisionHistoryEntry[];
}

export interface SourceLocator {
  kind: "local-path" | "url" | "git-ref" | "work-library";
  value: string;
}

export interface EvidenceSource {
  id: string;
  workspaceId: string;
  projectIds?: string[];
  kind:
    | "pasted-note"
    | "local-file"
    | "screenshot"
    | "local-git"
    | "github-pull-request"
    | "work-library";
  title: string;
  publicLabel: string;
  observedAt: string;
  summary: string;
  creatorOnly: {
    locators: SourceLocator[];
    rawExcerpt: string;
  };
}

export interface EvidenceBundle {
  schemaVersion: "1.0.0";
  workspaceId: string;
  sources: EvidenceSource[];
}

export interface ReportSection {
  id: string;
  title: string;
  summary: string;
  claimIds: string[];
  componentIds: string[];
}

export interface ReportComponent {
  id: string;
  sectionId: string;
  kind: "narrative" | "bullet-list" | "callout" | "visual" | "evidence-disclosure";
  heading?: string;
  body?: string;
  items?: string[];
  visualizationId?: string;
}

export interface ReportClaim {
  id: string;
  statement: string;
  implication: string;
  consequential: boolean;
  sourceIds: string[];
}

export interface DesignBrief {
  schemaVersion: "1.0.0";
  id: string;
  audience: string;
  pageJob: string;
  tone: string;
  colors: Record<"background" | "surface" | "text" | "mutedText" | "accent" | "border", string>;
  typography: Record<"displayRole" | "bodyRole" | "numericRole", string>;
  layoutConcept: string;
  visualSignature: string;
}

export interface VisualizationSpecification {
  schemaVersion: "1.0.0";
  id: string;
  family:
    | "workstream-landscape"
    | "timeline"
    | "comparison-table"
    | "risk-matrix"
    | "quantitative-chart"
    | "dependency-flow"
    | "evidence-gallery";
  title: string;
  purpose: string;
  claimIds: string[];
  data: {
    items?: Array<{
      label: string;
      description?: string;
      sourceId?: string;
      status?: "complete" | "active" | "attention" | "planned";
      value?: number;
      unit?: string;
      start?: string;
      end?: string;
    }>;
    relationships?: Array<{ from: string; to: string; label?: string }>;
  };
  textAlternative:
    | { type: "prose"; content: string }
    | { type: "table"; columns: string[]; rows: string[][] };
  replacementOptions: VisualizationSpecification["family"][];
}

export interface ReportSourceModel extends RevisionedDocument {
  schemaVersion: "1.0.0";
  mode: "snapshot" | "deep-dive";
  workspaceId: string;
  title: string;
  audience: string;
  purpose: string;
  reportingPeriod: {
    start: string;
    end: string;
    label: string;
  };
  sections: ReportSection[];
  components: ReportComponent[];
  claims: ReportClaim[];
  evidence: EvidenceBundle;
  design: DesignBrief;
  visualizations: VisualizationSpecification[];
  creatorOnly: {
    inputSummary: string;
    omissions: Array<{ reason: string; sourceIds: string[] }>;
  };
  renderedArtifacts: Array<{
    kind: "source-html" | "export-html" | "screenshot" | "pdf";
    contentHash: string;
    createdAt: string;
    creatorOnlyPath: string;
  }>;
}

export type PublicEvidenceSource = Omit<EvidenceSource, "creatorOnly">;

export interface ReportExportProjection {
  schemaVersion: "1.0.0";
  id: string;
  revision: number;
  mode: "snapshot" | "deep-dive";
  workspaceId: string;
  title: string;
  audience: string;
  purpose: string;
  reportingPeriod: ReportSourceModel["reportingPeriod"];
  sections: ReportSection[];
  components: ReportComponent[];
  claims: ReportClaim[];
  evidence: {
    schemaVersion: "1.0.0";
    workspaceId: string;
    sources: PublicEvidenceSource[];
  };
  design: DesignBrief;
  visualizations: VisualizationSpecification[];
  revisionHistory: RevisionHistoryEntry[];
}

export interface ContractValidationResult {
  valid: boolean;
  errors: string[];
}
