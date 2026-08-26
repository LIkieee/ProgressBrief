import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { projectReportForExport } from "../contracts/export-projection.js";
import type {
  ReportComponent,
  ReportExportProjection,
  ReportSection,
} from "../contracts/types.js";
import {
  assertFinalHtmlSize,
  optimizeRasterAsset,
} from "./assets.js";
import type {
  EmbeddedRasterAsset,
  ReportRasterAssetInput,
} from "./assets.js";
import { escapeAttribute, escapeHtml } from "./html.js";
import { renderVisualization } from "./visualizations.js";

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "font-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src data:",
  "media-src data:",
  "object-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
].join("; ");

const REPORT_CSS = `
:root {
  --background: {{background}};
  --surface: {{surface}};
  --text: {{text}};
  --muted: {{mutedText}};
  --accent: {{accent}};
  --border: {{border}};
  --attention: #9b4829;
  --attention-soft: #fff3ea;
  --accent-soft: #e8f2f1;
  color-scheme: light;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--background); color: var(--text); line-height: 1.55; }
a { color: currentColor; }
.skip-link { position: fixed; z-index: 10; left: 1rem; top: 1rem; padding: .65rem .9rem; background: var(--text); color: var(--surface); transform: translateY(-180%); }
.skip-link:focus { transform: translateY(0); }
.view-switcher { position: sticky; z-index: 5; top: 0; display: flex; justify-content: center; gap: .4rem; margin: 0; padding: .55rem; border: 0; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--background) 92%, transparent); backdrop-filter: blur(10px); }
.view-switcher legend { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.view-switcher label { display: inline-flex; align-items: center; gap: .4rem; padding: .38rem .65rem; border-radius: 999px; color: var(--muted); cursor: pointer; }
.view-switcher label:has(input:checked) { background: var(--text); color: var(--surface); }
.view-switcher input { margin: 0; accent-color: var(--accent); }
body:has(#view-presentation:checked) [data-reading-context] { display: none; }
.report-shell { width: min(100%, 1180px); margin: 0 auto; padding: clamp(1.25rem, 3.5vw, 3.5rem); }
.masthead { display: grid; grid-template-columns: minmax(0, 1fr) minmax(15rem, 28rem); gap: clamp(2rem, 6vw, 7rem); align-items: end; padding: clamp(2rem, 5vw, 5rem) 0 2rem; border-bottom: 1px solid var(--border); }
.eyebrow, .section-index { color: var(--accent); font-size: .74rem; font-weight: 750; letter-spacing: .13em; text-transform: uppercase; }
h1 { max-width: 16ch; margin: .45rem 0 .8rem; font-size: clamp(2.45rem, 6vw, 5.6rem); line-height: .96; letter-spacing: -.055em; }
.period { margin: 0; color: var(--muted); font-size: 1rem; }
.purpose { margin: 0; font-size: clamp(1.05rem, 1.7vw, 1.35rem); line-height: 1.45; }
.audience { margin: 1rem 0 0; color: var(--muted); font-size: .9rem; }
.section-nav { padding: 1rem 0; border-bottom: 1px solid var(--border); }
.section-nav ul { display: flex; flex-wrap: wrap; gap: .5rem 1.35rem; margin: 0; padding: 0; list-style: none; }
.section-nav a { color: var(--muted); font-size: .85rem; font-weight: 680; text-decoration-thickness: .08em; text-underline-offset: .25em; }
.report-section { display: grid; grid-template-columns: minmax(9rem, .6fr) minmax(0, 2fr); gap: clamp(1.5rem, 5vw, 5rem); padding: clamp(3rem, 7vw, 6.5rem) 0; border-bottom: 1px solid var(--border); scroll-margin-top: 4rem; }
.section-heading { position: sticky; top: 4.5rem; align-self: start; }
h2 { margin: .35rem 0 .8rem; font-size: clamp(1.65rem, 3vw, 2.8rem); line-height: 1.05; letter-spacing: -.035em; }
.section-summary { margin: 0; color: var(--muted); }
.component-stack { display: grid; gap: 1.4rem; min-width: 0; }
.component { min-width: 0; }
.component h3 { margin: 0 0 .45rem; font-size: 1.05rem; letter-spacing: -.01em; }
.component p { max-width: 68ch; margin: 0; }
.component ul { margin: .4rem 0 0; padding-left: 1.25rem; }
.component li + li { margin-top: .45rem; }
.component-callout { padding: 1rem 1.15rem; border-left: 4px solid var(--accent); background: var(--accent-soft); }
.component-callout[data-attention="true"] { border-left-color: var(--attention); background: var(--attention-soft); }
details { border-top: 1px solid var(--border); }
summary { padding: .8rem 0; color: var(--muted); font-weight: 700; cursor: pointer; }
summary:focus-visible, a:focus-visible, input:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.evidence-list { display: grid; gap: .75rem; margin: 0 0 1rem; padding: 0; list-style: none; }
.evidence-list li { display: grid; gap: .15rem; padding-left: .8rem; border-left: 2px solid var(--border); }
.evidence-list span, .evidence-list small { color: var(--muted); }
.claim-context ul { margin-bottom: 1rem; }
.visualization { margin: .25rem 0; padding: clamp(1rem, 3vw, 1.6rem); border: 1px solid var(--border); background: var(--surface); }
.visualization figcaption { display: grid; gap: .2rem; margin-bottom: 1rem; }
.visualization figcaption strong { font-size: 1.05rem; }
.visualization figcaption span { color: var(--muted); font-size: .88rem; }
.visualization svg { display: block; width: 100%; height: auto; overflow: visible; }
.chart-label, .chart-value, .visualization text { fill: var(--text); font-family: inherit; font-size: 14px; }
.chart-value { font-variant-numeric: tabular-nums; font-weight: 750; }
.chart-bar { fill: var(--accent); }
.flow-node { fill: var(--accent-soft); stroke: var(--border); }
.flow-line { stroke: var(--accent); stroke-width: 2; }
.flow-line + text, .flow-label { fill: var(--muted); font-size: 12px; }
marker path { fill: var(--accent); }
.visual-alternative { margin-top: 1rem; }
.table-scroll { max-width: 100%; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: .88rem; }
th, td { padding: .6rem; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
thead th { color: var(--muted); font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; }
.workstream-landscape, .evidence-gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: .75rem; margin: 0; padding: 0; list-style: none; }
.workstream-landscape li, .evidence-gallery li { display: grid; gap: .25rem; padding: .9rem; border: 1px solid var(--border); }
.workstream-landscape small, .evidence-gallery small { color: var(--muted); }
.timeline { margin: 0; padding: 0; list-style: none; }
.timeline li { display: grid; grid-template-columns: 1rem 1fr; gap: .75rem; padding-bottom: 1rem; }
.timeline li div { display: grid; gap: .15rem; }
.timeline li span { color: var(--muted); }
.timeline-marker { width: .75rem; height: .75rem; margin-top: .4rem; border: 2px solid var(--accent); border-radius: 50%; background: var(--surface); }
.risk-matrix { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
.risk-matrix > div { display: grid; gap: .25rem; padding: .85rem; border: 1px solid var(--border); }
.risk-matrix span { color: var(--muted); }
.evidence-frame { display: grid; min-height: 7rem; place-items: center; background: var(--accent-soft); color: var(--accent); font-size: 1.4rem; font-weight: 800; }
.evidence-frame img { display: block; width: 100%; height: auto; }
.report-footer { display: flex; justify-content: space-between; gap: 1rem; padding: 1.5rem 0 0; color: var(--muted); font-size: .78rem; }
@media (max-width: 700px) {
  .report-shell { padding: 1rem; }
  .masthead, .report-section { grid-template-columns: 1fr; gap: 1.2rem; }
  .masthead { padding-top: 2rem; }
  h1 { font-size: clamp(2.35rem, 13vw, 4rem); }
  .section-heading { position: static; }
  .section-nav ul { display: grid; grid-template-columns: repeat(2, 1fr); }
  .risk-matrix { grid-template-columns: 1fr; }
  .visualization .chart-label, .visualization .chart-value { font-size: 22px; }
  .report-footer { display: grid; }
}
@media print {
  :root { --background: #ffffff; }
  .view-switcher, .skip-link, .section-nav { display: none !important; }
  [data-reading-context] { display: block !important; }
  body { background: #ffffff; font-size: 10.5pt; }
  .report-shell { width: 100%; padding: 0; }
  .masthead { padding: 0 0 1rem; }
  h1 { font-size: 34pt; }
  .report-section { grid-template-columns: 8rem minmax(0, 1fr); gap: 1rem; padding: 1.35rem 0; break-inside: avoid; }
  .section-heading { position: static; }
  .component, .visualization, details { break-inside: avoid; }
  details > * { display: block; }
  summary { list-style: none; }
  .report-footer { padding-top: 1rem; }
  @page { margin: 14mm; }
}`;

export interface RenderOptions {
  renderedAt: string;
}

export interface WriteReportExportOptions extends RenderOptions {
  rasterAssets?: readonly ReportRasterAssetInput[];
}

export interface RenderedExportMetadata {
  schemaVersion: "1.0.0";
  reportId: string;
  reportRevision: number;
  kind: "export-html";
  contentHash: string;
  createdAt: string;
  sizeBytes: number;
}

export interface RenderedReport {
  html: string;
  metadata: RenderedExportMetadata;
}

function styleFor(report: ReportExportProjection): string {
  return REPORT_CSS
    .replaceAll("{{background}}", report.design.colors.background)
    .replaceAll("{{surface}}", report.design.colors.surface)
    .replaceAll("{{text}}", report.design.colors.text)
    .replaceAll("{{mutedText}}", report.design.colors.mutedText)
    .replaceAll("{{accent}}", report.design.colors.accent)
    .replaceAll("{{border}}", report.design.colors.border)
    .trim();
}

function sectionAnchor(section: ReportSection, index: number): string {
  const slug = section.title.toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
  return slug.length === 0 ? `section-${String(index + 1)}` : slug;
}

function renderEvidenceDisclosure(
  component: ReportComponent,
  report: ReportExportProjection,
): string {
  const sources = (component.items ?? []).map((label) => ({
    label,
    source: report.evidence.sources.find(({ publicLabel }) => publicLabel === label),
  }));
  return `<details data-evidence-disclosure><summary>${escapeHtml(component.heading ?? "Evidence")} · ${String(sources.length)} sources</summary><ul class="evidence-list">${sources.map(({ label, source }) => `<li><strong>${escapeHtml(label)}</strong>${source === undefined ? "" : `<span>${escapeHtml(source.summary)}</span><small>${escapeHtml(source.kind.replaceAll("-", " "))}</small>`}</li>`).join("")}</ul></details>`;
}

function renderComponent(
  component: ReportComponent,
  report: ReportExportProjection,
  embeddedAssets: ReadonlyMap<string, EmbeddedRasterAsset>,
): string {
  const heading = component.heading === undefined
    ? ""
    : `<h3>${escapeHtml(component.heading)}</h3>`;
  let content: string;

  switch (component.kind) {
    case "narrative":
      content = `${heading}<p>${escapeHtml(component.body ?? "")}</p>`;
      break;
    case "bullet-list":
      content = `${heading}<ul>${(component.items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
      break;
    case "callout":
      content = `${heading}<p>${escapeHtml(component.body ?? "")}</p>`;
      break;
    case "visual": {
      const visualization = report.visualizations.find(({ id }) => id === component.visualizationId);
      if (visualization === undefined) {
        throw new Error(`Cannot render component ${component.id}: visualization is missing.`);
      }
      content = renderVisualization(visualization, embeddedAssets);
      break;
    }
    case "evidence-disclosure":
      content = renderEvidenceDisclosure(component, report);
      break;
  }

  const attention = component.kind === "callout" && /dependency|block|risk/iu.test(
    `${component.heading ?? ""} ${component.body ?? ""}`,
  );
  return `<article class="component component-${escapeAttribute(component.kind)}" data-essential data-component-id="${escapeAttribute(component.id)}"${attention ? ' data-attention="true"' : ""}>${content}</article>`;
}

function renderClaimContext(
  section: ReportSection,
  report: ReportExportProjection,
): string {
  const claims = section.claimIds
    .map((id) => report.claims.find((claim) => claim.id === id))
    .filter((claim) => claim !== undefined);
  if (claims.length === 0) return "";
  return `<details class="claim-context" data-reading-context><summary>Why this matters</summary><ul>${claims.map((claim) => `<li><strong>${escapeHtml(claim.statement)}</strong> ${escapeHtml(claim.implication)}</li>`).join("")}</ul></details>`;
}

function renderSection(
  section: ReportSection,
  index: number,
  report: ReportExportProjection,
  embeddedAssets: ReadonlyMap<string, EmbeddedRasterAsset>,
): string {
  const components = section.componentIds.map((id) => {
    const component = report.components.find((candidate) => candidate.id === id);
    if (component === undefined) throw new Error(`Cannot render section ${section.id}: component ${id} is missing.`);
    return renderComponent(component, report, embeddedAssets);
  }).join("");
  return `<section class="report-section" id="${escapeAttribute(sectionAnchor(section, index))}" data-essential data-section-id="${escapeAttribute(section.id)}"><div class="section-heading"><span class="section-index">${String(index + 1).padStart(2, "0")}</span><h2>${escapeHtml(section.title)}</h2><p class="section-summary" data-reading-context>${escapeHtml(section.summary)}</p></div><div class="component-stack">${components}${renderClaimContext(section, report)}</div></section>`;
}

function createHtml(
  report: ReportExportProjection,
  embeddedAssets: ReadonlyMap<string, EmbeddedRasterAsset>,
): string {
  const navigation = report.sections
    .map((section, index) => `<li><a href="#${escapeAttribute(sectionAnchor(section, index))}">${escapeHtml(section.title)}</a></li>`)
    .join("");
  const sections = report.sections
    .map((section, index) => renderSection(section, index, report, embeddedAssets))
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(CONTENT_SECURITY_POLICY)}">
<meta name="generator" content="ProgressBrief">
<title>${escapeHtml(report.title)}</title>
<style>${styleFor(report)}</style>
</head>
<body data-report-id="${escapeAttribute(report.id)}">
<a class="skip-link" href="#report-main">Skip to report</a>
<fieldset class="view-switcher" aria-label="Report view"><legend>Report view</legend><label><input id="view-presentation" type="radio" name="report-view" aria-label="Presentation view"> Presentation</label><label><input id="view-reading" type="radio" name="report-view" aria-label="Reading view" checked> Reading</label></fieldset>
<div class="report-shell">
<header class="masthead" data-essential><div><span class="eyebrow">${escapeHtml(report.mode === "snapshot" ? "Snapshot" : "Deep Dive")} · ${escapeHtml(report.reportingPeriod.label)}</span><h1>${escapeHtml(report.title)}</h1><p class="period"><time datetime="${escapeAttribute(report.reportingPeriod.start)}">${escapeHtml(report.reportingPeriod.start)}</time> — <time datetime="${escapeAttribute(report.reportingPeriod.end)}">${escapeHtml(report.reportingPeriod.end)}</time></p></div><div><p class="purpose">${escapeHtml(report.purpose)}</p><p class="audience">Prepared for ${escapeHtml(report.audience)}</p></div></header>
<nav class="section-nav" aria-label="Report sections"><ul>${navigation}</ul></nav>
<main id="report-main" tabindex="-1">${sections}</main>
<footer class="report-footer"><span>ProgressBrief · clean export</span><span>Revision ${String(report.revision)}</span></footer>
</div>
</body>
</html>`;
}

export function renderReport(document: unknown, options: RenderOptions): RenderedReport {
  const report = projectReportForExport(document);
  return renderProjectedReport(report, options, new Map());
}

function renderProjectedReport(
  report: ReportExportProjection,
  options: RenderOptions,
  embeddedAssets: ReadonlyMap<string, EmbeddedRasterAsset>,
): RenderedReport {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(options.renderedAt)) {
    throw new Error("renderedAt must be an explicit UTC timestamp for deterministic metadata.");
  }
  const html = createHtml(report, embeddedAssets);
  assertFinalHtmlSize(
    html,
    [...embeddedAssets.values()].map(({ bytes, sourceName }) => ({
      sizeBytes: bytes.byteLength,
      sourceName,
    })),
  );
  return {
    html,
    metadata: {
      schemaVersion: "1.0.0",
      reportId: report.id,
      reportRevision: report.revision,
      kind: "export-html",
      contentHash: createHash("sha256").update(html).digest("hex"),
      createdAt: options.renderedAt,
      sizeBytes: Buffer.byteLength(html),
    },
  };
}

export async function renderReportWithAssets(
  document: unknown,
  options: RenderOptions,
  rasterAssets: readonly ReportRasterAssetInput[],
): Promise<RenderedReport> {
  const report = projectReportForExport(document);
  const evidenceById = new Map(report.evidence.sources.map((source) => [source.id, source]));
  const referencedSourceIds = new Set(
    report.visualizations
      .filter(({ family }) => family === "evidence-gallery")
      .flatMap(({ data }) => data.items ?? [])
      .flatMap(({ sourceId }) => sourceId === undefined ? [] : [sourceId]),
  );
  const embeddedAssets = new Map<string, EmbeddedRasterAsset>();

  for (const input of rasterAssets) {
    if (embeddedAssets.has(input.sourceId)) {
      throw new Error(`Raster asset source ${input.sourceId} was supplied more than once.`);
    }
    const evidence = evidenceById.get(input.sourceId);
    if (evidence === undefined) {
      throw new Error(`Raster asset source ${input.sourceId} is not present in the report evidence.`);
    }
    if (evidence.kind !== "screenshot") {
      throw new Error(`Raster asset source ${input.sourceId} is not screenshot evidence.`);
    }
    if (!referencedSourceIds.has(input.sourceId)) {
      throw new Error(`Raster asset source ${input.sourceId} is not referenced by an evidence gallery.`);
    }
    const optimized = await optimizeRasterAsset(input);
    embeddedAssets.set(input.sourceId, { ...optimized, sourceId: input.sourceId });
  }

  for (const sourceId of referencedSourceIds) {
    if (!evidenceById.has(sourceId)) {
      throw new Error(`Evidence gallery references unknown source ${sourceId}.`);
    }
    if (!embeddedAssets.has(sourceId)) {
      throw new Error(`Evidence gallery source ${sourceId} requires a raster asset.`);
    }
  }

  return renderProjectedReport(report, options, embeddedAssets);
}

export async function writeReportExport(
  document: unknown,
  outputPath: string,
  options: WriteReportExportOptions,
): Promise<RenderedExportMetadata> {
  const renderOptions = { renderedAt: options.renderedAt };
  const rendered = options.rasterAssets === undefined
    ? renderReport(document, renderOptions)
    : await renderReportWithAssets(document, renderOptions, options.rasterAssets);
  const outputDirectory = dirname(outputPath);
  const temporaryPath = join(
    outputDirectory,
    `.${basename(outputPath)}.${String(process.pid)}.tmp`,
  );
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(temporaryPath, rendered.html, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, outputPath);
  return rendered.metadata;
}
