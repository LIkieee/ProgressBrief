export const PRODUCT_NAME = "ProgressBrief";
export const MINIMUM_NODE_MAJOR = 24;

export { projectReportForExport } from "./contracts/export-projection.js";
export { createStableId, isStableId } from "./contracts/ids.js";
export { advanceRevision } from "./contracts/revisions.js";
export {
  assertValidDocument,
  validateDocument,
} from "./contracts/schema-validator.js";
export {
  assertValidReportModel,
  validateReportModel,
} from "./contracts/report-semantics.js";
export type {
  ReportExportProjection,
  ReportSourceModel,
} from "./contracts/types.js";
export {
  MAX_FINAL_HTML_BYTES,
  MAX_SOURCE_ASSET_BYTES,
  assertFinalHtmlSize,
  optimizeRasterAsset,
} from "./renderer/assets.js";
export type {
  EmbeddedRasterAsset,
  OptimizedRasterAsset,
  RasterAssetInput,
  ReportRasterAssetInput,
} from "./renderer/assets.js";
export {
  renderReport,
  renderReportWithAssets,
  writeReportExport,
} from "./renderer/render-report.js";
export type {
  RenderOptions,
  RenderedExportMetadata,
  RenderedReport,
  WriteReportExportOptions,
} from "./renderer/render-report.js";
export {
  VISUALIZATION_FAMILIES,
  renderVisualization,
  replaceVisualizationFamily,
} from "./renderer/visualizations.js";
export { createConfirmationPlan } from "./report/confirmation.js";
export { validateDeepDiveProposal } from "./report/deep-dive-invariants.js";
export { validateSnapshotProposal } from "./report/proposal-invariants.js";
export {
  resolveReportMode,
  resolveReportRequest,
  resolveReportingPeriod,
} from "./report/resolution.js";
export {
  DEFAULT_SNAPSHOT_STRUCTURE,
  resolveStructure,
} from "./report/structure.js";
export {
  FeedbackQueueStore,
  applyInlineEditFeedback,
  componentContentHash,
  componentTargetHashes,
  createFeedbackTarget,
  reconcileFeedbackQueue,
} from "./review/feedback.js";
export type {
  FeedbackItem,
  FeedbackOperationInput,
  FeedbackQueue,
  FeedbackQueueStoreOptions,
  FeedbackTarget,
} from "./review/feedback.js";
export { createFeedbackInvocations } from "./review/invocations.js";
export type {
  FeedbackInvocationPaths,
  FeedbackInvocations,
} from "./review/invocations.js";
export { startReviewServer } from "./review/server.js";
export type {
  ReviewServer,
  StartReviewServerOptions,
} from "./review/server.js";
export type {
  AgentDeepDiveProposal,
  AgentReportProposal,
  ConfirmationPlan,
  ResolvedReportRequest,
  StructureResolution,
} from "./report/types.js";
export {
  captureMemory,
  classifyMemoryRequest,
  readKnowledgeNotes,
  readWorklogEntries,
} from "./library/capture.js";
export {
  initializeWorkLibrary,
  listActiveWorkspaces,
  loadWorkspace,
  setWorkspaceArchived,
  undoLastMutation,
} from "./library/workspace.js";
export {
  recallFromLibrary,
  searchRecallCandidates,
} from "./library/recall.js";
export type {
  RecallCandidate,
  RecallMatchedField,
  RecallOptions,
  RecallResult,
  RecallSearchOptions,
  RecallSearchResult,
  RecallWorkspaceChoice,
} from "./library/recall.js";
export {
  applyCurationProposal,
  createCurationProposal,
  discoverCurationCandidates,
  validateCurationProposal,
} from "./library/curate.js";
export type {
  ApplyCurationProposalOptions,
  ApplyCurationProposalResult,
  CreateCurationProposalInput,
  CurationCandidate,
  CurationCandidateKind,
  CurationDiscoveryResult,
  CurationOperation,
  CurationOperationKind,
  CurationProposal,
  CurationValidationResult,
  DiscoverCurationCandidatesOptions,
} from "./library/curate.js";
export type {
  CaptureClassification,
  CaptureMemoryOptions,
  CaptureMemoryResult,
  KnowledgeNote,
  KnowledgeResolution,
  Visibility,
  WorklogEntry,
  WorkspaceDocument,
} from "./library/types.js";

export function assertSupportedNode(version = process.versions.node): void {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);

  if (!Number.isInteger(major) || major < MINIMUM_NODE_MAJOR) {
    throw new Error(
      `${PRODUCT_NAME} requires Node.js ${MINIMUM_NODE_MAJOR} or newer; received ${version}.`,
    );
  }
}
