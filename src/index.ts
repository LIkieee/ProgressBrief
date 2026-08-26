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

export function assertSupportedNode(version = process.versions.node): void {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);

  if (!Number.isInteger(major) || major < MINIMUM_NODE_MAJOR) {
    throw new Error(
      `${PRODUCT_NAME} requires Node.js ${MINIMUM_NODE_MAJOR} or newer; received ${version}.`,
    );
  }
}
