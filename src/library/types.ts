export type Visibility = "private" | "internal" | "shareable";

export interface RepositoryAssociation {
  resolvedRealPath: string;
  canonicalRemoteUrl?: string;
}

export interface WorkspaceProject {
  id: string;
  slug: string;
  name: string;
  repositoryAssociations: RepositoryAssociation[];
}

export interface WorkspaceDocument {
  schemaVersion: "1.0.0";
  id: string;
  slug: string;
  name: string;
  kind: "employer" | "personal";
  defaultVisibility: Visibility;
  archived: boolean;
  projects: WorkspaceProject[];
  createdAt: string;
  updatedAt: string;
}

export interface WorklogEntry {
  schemaVersion: "1.0.0";
  id: string;
  workspaceId: string;
  occurredOn: string;
  createdAt: string;
  updatedAt: string;
  projectIds: string[];
  visibility: Visibility;
  category: "outcome" | "decision" | "blocker" | "plan" | "collaboration" | "activity";
  summary: string;
  details: string;
  sourceIds: string[];
  relatedKnowledgeIds: string[];
}

export interface KnowledgeRelationship {
  type: "related" | "updates" | "supersedes";
  targetId: string;
}

export interface KnowledgeNote {
  schemaVersion: "1.0.0";
  id: string;
  workspaceId: string;
  title: string;
  visibility: Visibility;
  status: "current" | "superseded";
  projectIds: string[];
  topics: string[];
  body: string;
  examples: string[];
  caveats: string[];
  sourceIds: string[];
  relationships: KnowledgeRelationship[];
  createdAt: string;
  updatedAt: string;
}

export interface LibraryConfigWorkspace {
  id: string;
  slug: string;
  relativePath: string;
}

export interface LibraryConfig {
  schemaVersion: "1.0.0";
  workspaces: LibraryConfigWorkspace[];
}

export interface MutationChange {
  relativePath: string;
  before: string | null;
  afterHash: string | null;
}

export interface LibraryMutation {
  id: string;
  workspaceId: string;
  description: string;
  createdAt: string;
  status: "prepared" | "committed" | "rolled-back" | "undone";
  changes: MutationChange[];
  completedAt?: string;
}

export interface MutationJournal {
  schemaVersion: "1.0.0";
  mutations: LibraryMutation[];
}

export interface LibraryMutationInput {
  path: string;
  before: string | null;
  after: string | null;
}

export interface KnowledgeResolution {
  action: "enrich" | "related" | "supersede";
  targetId: string;
}

export interface KnowledgeCaptureInput {
  title?: string;
  topics?: string[];
  body?: string;
  examples?: string[];
  caveats?: string[];
  sourceIds?: string[];
  resolution?: KnowledgeResolution;
}

export interface CaptureMemoryOptions {
  libraryDirectory: string;
  workspace: string;
  text: string;
  occurredOn?: string;
  now?: string;
  projectIds?: string[];
  sourceIds?: string[];
  category?: WorklogEntry["category"];
  knowledge?: KnowledgeCaptureInput;
}

export interface CaptureClassification {
  destinations: Array<"worklog" | "knowledge">;
  text: string;
}

export type KnowledgeWriteAction =
  | "created"
  | "duplicate-skipped"
  | "enriched"
  | "related-created"
  | "superseded";

export interface CaptureMemoryResult extends CaptureClassification {
  acknowledgement: string;
  worklogEntry?: WorklogEntry;
  knowledgeNote?: KnowledgeNote;
  knowledgeAction?: KnowledgeWriteAction;
}
