import sharp from "sharp";

export const MAX_SOURCE_ASSET_BYTES = 10 * 1024 * 1024;
export const MAX_FINAL_HTML_BYTES = 40 * 1024 * 1024;

const SUPPORTED_RASTER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface RasterAssetInput {
  bytes: Uint8Array;
  mimeType: string;
  sourceName: string;
}

export interface ReportRasterAssetInput extends RasterAssetInput {
  sourceId: string;
}

export interface OptimizedRasterAsset {
  bytes: Buffer;
  dataUri: string;
  height: number;
  mimeType: "image/webp";
  sourceName: string;
  width: number;
}

export interface EmbeddedRasterAsset extends OptimizedRasterAsset {
  sourceId: string;
}

export interface EmbeddedAssetSummary {
  sourceName: string;
  sizeBytes: number;
}

function mebibytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export async function optimizeRasterAsset(
  input: RasterAssetInput,
): Promise<OptimizedRasterAsset> {
  if (input.bytes.byteLength > MAX_SOURCE_ASSET_BYTES) {
    throw new Error(
      `Asset ${JSON.stringify(input.sourceName)} is ${mebibytes(input.bytes.byteLength)}; ` +
        "each source asset must be 10 MiB or smaller.",
    );
  }
  if (!SUPPORTED_RASTER_TYPES.has(input.mimeType)) {
    throw new Error(
      `Asset ${JSON.stringify(input.sourceName)} has unsupported raster type ${JSON.stringify(input.mimeType)}.`,
    );
  }

  const result = await sharp(input.bytes, { failOn: "error" })
    .rotate()
    .resize({
      fit: "inside",
      height: 1920,
      width: 1920,
      withoutEnlargement: true,
    })
    .webp({ effort: 5, quality: 82 })
    .toBuffer({ resolveWithObject: true });

  return {
    bytes: result.data,
    dataUri: `data:image/webp;base64,${result.data.toString("base64")}`,
    height: result.info.height,
    mimeType: "image/webp",
    sourceName: input.sourceName,
    width: result.info.width,
  };
}

export function assertFinalHtmlSize(
  html: string,
  embeddedAssets: readonly EmbeddedAssetSummary[] = [],
): void {
  const sizeBytes = Buffer.byteLength(html);
  if (sizeBytes <= MAX_FINAL_HTML_BYTES) return;

  const assetList = [...embeddedAssets]
    .sort((left, right) => right.sizeBytes - left.sizeBytes)
    .map(({ sizeBytes: assetBytes, sourceName }) => `${sourceName} (${mebibytes(assetBytes)})`)
    .join(", ");
  const remedy = assetList.length > 0
    ? ` Reduce or remove these embedded assets: ${assetList}.`
    : " Reduce the report content or embedded assets.";
  throw new Error(
    `Finalized HTML is ${mebibytes(sizeBytes)} and exceeds the 40 MiB hard limit.${remedy}`,
  );
}
