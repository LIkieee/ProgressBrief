export const PRODUCT_NAME = "ProgressBrief";
export const MINIMUM_NODE_MAJOR = 24;

export function assertSupportedNode(version = process.versions.node): void {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);

  if (!Number.isInteger(major) || major < MINIMUM_NODE_MAJOR) {
    throw new Error(
      `${PRODUCT_NAME} requires Node.js ${MINIMUM_NODE_MAJOR} or newer; received ${version}.`,
    );
  }
}
