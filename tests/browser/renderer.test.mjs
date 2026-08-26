import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MAX_FINAL_HTML_BYTES,
  MAX_SOURCE_ASSET_BYTES,
  assertFinalHtmlSize,
  optimizeRasterAsset,
} from "../../dist/renderer/assets.js";
import {
  renderReport,
  renderReportWithAssets,
  writeReportExport,
} from "../../dist/renderer/render-report.js";
import {
  VISUALIZATION_FAMILIES,
  renderVisualization,
  replaceVisualizationFamily,
} from "../../dist/renderer/visualizations.js";

const root = new URL("../../", import.meta.url);
const goldenUrl = new URL(
  "fixtures/snapshot-three-workstreams/golden-report-model.json",
  root,
);
const screenshotUrl = new URL(
  "fixtures/snapshot-three-workstreams/input/rollout-dashboard.png",
  root,
);
const renderOptions = { renderedAt: "2026-08-26T16:30:00Z" };

async function golden() {
  return JSON.parse(await readFile(goldenUrl, "utf8"));
}

test("rendering the golden model is byte-identical and produces stable export metadata", async () => {
  const report = await golden();
  const first = renderReport(report, renderOptions);
  const second = renderReport(structuredClone(report), renderOptions);

  assert.deepEqual(second, first);
  assert.match(first.html, /^<!doctype html>/u);
  assert.match(first.metadata.contentHash, /^[0-9a-f]{64}$/u);
  assert.equal(first.metadata.createdAt, renderOptions.renderedAt);
  assert.equal(first.metadata.reportId, report.id);
  assert.equal(first.metadata.reportRevision, report.revision);
  assert.equal(first.metadata.sizeBytes, Buffer.byteLength(first.html));

  const directory = await mkdtemp(join(tmpdir(), "progressbrief-render-"));
  const outputPath = join(directory, "snapshot.html");
  const written = await writeReportExport(report, outputPath, renderOptions);
  assert.deepEqual(written, first.metadata);
  assert.equal(await readFile(outputPath, "utf8"), first.html);
  assert.equal((await stat(outputPath)).size, first.metadata.sizeBytes);
});

test("the clean export is self-contained, restrictive, creator-free, and safely escaped", async () => {
  const report = await golden();
  report.sections[0].title = "Orientation </h2><script>window.pwned = true</script>";
  report.components[0].body = "Status <img src=x onerror=alert(1)> & measured.";

  const { html } = renderReport(report, renderOptions);

  assert.match(html, /Content-Security-Policy/u);
  assert.match(html, /default-src &#39;none&#39;/u);
  assert.match(html, /script-src &#39;none&#39;/u);
  assert.doesNotMatch(html, /<script|<img src=x|creatorOnly|ghp_fixture|\/Users\/casey/u);
  assert.doesNotMatch(html, /https?:\/\//u);
  assert.match(html, /Orientation &lt;\/h2&gt;&lt;script&gt;/u);
  assert.match(html, /Status &lt;img src=x onerror=alert\(1\)&gt; &amp; measured\./u);
  assert.match(html, /<style>[\s\S]+<\/style>/u);
  assert.match(html, /<svg/u);
  assert.match(html, /<details[^>]*data-evidence-disclosure/u);
});

test("all initial visualization families have semantic output and a text equivalent", async () => {
  const report = await golden();
  const base = report.visualizations[0];

  assert.deepEqual(VISUALIZATION_FAMILIES, [
    "workstream-landscape",
    "timeline",
    "comparison-table",
    "risk-matrix",
    "quantitative-chart",
    "dependency-flow",
    "evidence-gallery",
  ]);

  for (const family of VISUALIZATION_FAMILIES) {
    const specification = {
      ...structuredClone(base),
      family,
      data:
        family === "dependency-flow"
          ? {
              relationships: [
                { from: "Implementation ready", to: "Security review", label: "awaits" },
                { from: "Security review", to: "Cohort launch", label: "unblocks" },
              ],
            }
          : structuredClone(base.data),
    };
    const rendered = renderVisualization(specification);
    assert.match(rendered, new RegExp(`data-viz-family="${family}"`, "u"));
    assert.match(rendered, /data-text-alternative/u);
    assert.doesNotMatch(rendered, /undefined|\[object Object\]/u);
  }

  const replacement = replaceVisualizationFamily(base, "comparison-table");
  assert.equal(replacement.family, "comparison-table");
  assert.equal(replacement.id, base.id);
  assert.deepEqual(replacement.claimIds, base.claimIds);
  assert.deepEqual(replacement.textAlternative, base.textAlternative);
  assert.equal(base.family, "quantitative-chart", "replacement must not mutate its input");
  assert.throws(
    () => replaceVisualizationFamily(base, "risk-matrix"),
    /not an allowed replacement/u,
  );
});

test("raster assets are optimized and hard size limits fail with actionable asset names", async () => {
  const source = await readFile(screenshotUrl);
  const optimized = await optimizeRasterAsset({
    bytes: source,
    mimeType: "image/png",
    sourceName: "rollout-dashboard.png",
  });

  assert.equal(optimized.mimeType, "image/webp");
  assert.equal(optimized.width, 960);
  assert.equal(optimized.height, 540);
  assert.ok(optimized.bytes.length < source.length);
  assert.match(optimized.dataUri, /^data:image\/webp;base64,/u);

  await assert.rejects(
    optimizeRasterAsset({
      bytes: Buffer.alloc(MAX_SOURCE_ASSET_BYTES + 1),
      mimeType: "image/png",
      sourceName: "oversized-evidence.png",
    }),
    /oversized-evidence\.png.*10 MiB/u,
  );

  assert.throws(
    () =>
      assertFinalHtmlSize("x".repeat(MAX_FINAL_HTML_BYTES + 1), [
        { sourceName: "large-dashboard.png", sizeBytes: 21 * 1024 * 1024 },
        { sourceName: "secondary-evidence.webp", sizeBytes: 19 * 1024 * 1024 },
      ]),
    /40 MiB.*large-dashboard\.png.*secondary-evidence\.webp/us,
  );
});

test("source-linked screenshot evidence is optimized and embedded without a runtime request", async () => {
  const report = await golden();
  const screenshotEvidence = report.evidence.sources.find(({ kind }) => kind === "screenshot");
  assert.ok(screenshotEvidence, "the golden fixture must include screenshot evidence");
  report.visualizations[0] = {
    ...report.visualizations[0],
    family: "evidence-gallery",
    data: {
      items: [
        {
          label: "Rollout dashboard",
          description: "Synthetic cohort-readiness evidence.",
          sourceId: screenshotEvidence.id,
        },
      ],
    },
    textAlternative: {
      type: "prose",
      content: "The rollout dashboard shows the first cohort ready for review.",
    },
  };
  const source = await readFile(screenshotUrl);
  const assets = [
    {
      bytes: source,
      mimeType: "image/png",
      sourceId: screenshotEvidence.id,
      sourceName: "rollout-dashboard.png",
    },
  ];

  const first = await renderReportWithAssets(report, renderOptions, assets);
  const second = await renderReportWithAssets(structuredClone(report), renderOptions, assets);
  assert.deepEqual(second, first, "fixed raster inputs must render deterministically");
  assert.match(first.html, /<img[^>]+src="data:image\/webp;base64,/u);
  assert.match(first.html, /alt="Rollout dashboard"/u);
  assert.doesNotMatch(first.html, /file:|https?:\/\//u);

  const encoded = first.html.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/u)?.[1];
  assert.ok(encoded, "the optimized WebP must be present in the clean HTML");
  assert.ok(Buffer.from(encoded, "base64").length < source.length);

  const directory = await mkdtemp(join(tmpdir(), "progressbrief-gallery-"));
  const outputPath = join(directory, "snapshot-gallery.html");
  const written = await writeReportExport(report, outputPath, {
    ...renderOptions,
    rasterAssets: assets,
  });
  assert.deepEqual(written, first.metadata);
  assert.equal(await readFile(outputPath, "utf8"), first.html);
});
