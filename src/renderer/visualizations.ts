import type { VisualizationSpecification } from "../contracts/types.js";
import type { EmbeddedRasterAsset } from "./assets.js";
import { escapeAttribute, escapeHtml } from "./html.js";

export const VISUALIZATION_FAMILIES = [
  "workstream-landscape",
  "timeline",
  "comparison-table",
  "risk-matrix",
  "quantitative-chart",
  "dependency-flow",
  "evidence-gallery",
] as const satisfies readonly VisualizationSpecification["family"][];

function renderTextAlternative(
  alternative: VisualizationSpecification["textAlternative"],
): string {
  if (alternative.type === "prose") {
    return `<details class="visual-alternative" data-text-alternative><summary>Text description</summary><p>${escapeHtml(alternative.content)}</p></details>`;
  }

  const headings = alternative.columns
    .map((column) => `<th scope="col">${escapeHtml(column)}</th>`)
    .join("");
  const rows = alternative.rows
    .map(
      (row) =>
        `<tr>${row.map((cell, index) => index === 0 ? `<th scope="row">${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<details class="visual-alternative" data-text-alternative><summary>View data as a table</summary><div class="table-scroll"><table><thead><tr>${headings}</tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

function itemDescription(
  item: NonNullable<VisualizationSpecification["data"]["items"]>[number],
): string {
  const parts = [item.description];
  if (item.value !== undefined) {
    parts.push(`${String(item.value)}${item.unit === undefined ? "" : ` ${item.unit}`}`);
  }
  if (item.start !== undefined || item.end !== undefined) {
    parts.push([item.start, item.end].filter(Boolean).join(" to "));
  }
  return parts.filter((part): part is string => part !== undefined && part.length > 0).join(" · ");
}

function renderLandscape(specification: VisualizationSpecification): string {
  const items = specification.data.items ?? [];
  return `<ul class="workstream-landscape">${items.map((item) => `<li data-status="${escapeAttribute(item.status ?? "active")}"><span>${escapeHtml(item.label)}</span>${itemDescription(item).length === 0 ? "" : `<small>${escapeHtml(itemDescription(item))}</small>`}</li>`).join("")}</ul>`;
}

function renderTimeline(specification: VisualizationSpecification): string {
  const items = specification.data.items ?? [];
  return `<ol class="timeline">${items.map((item) => `<li><span class="timeline-marker" aria-hidden="true"></span><div><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(itemDescription(item) || "Date not supplied")}</span></div></li>`).join("")}</ol>`;
}

function renderComparison(specification: VisualizationSpecification): string {
  const items = specification.data.items ?? [];
  return `<div class="table-scroll"><table class="comparison"><thead><tr><th scope="col">Option</th><th scope="col">Detail</th><th scope="col">Status</th></tr></thead><tbody>${items.map((item) => `<tr><th scope="row">${escapeHtml(item.label)}</th><td>${escapeHtml(itemDescription(item) || "No additional detail")}</td><td>${escapeHtml(item.status ?? "Not specified")}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderRiskMatrix(specification: VisualizationSpecification): string {
  const items = specification.data.items ?? [];
  return `<div class="risk-matrix" role="list" aria-label="Risk and attention items">${items.map((item) => `<div role="listitem" data-status="${escapeAttribute(item.status ?? "attention")}"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(itemDescription(item) || item.status || "Attention")}</span></div>`).join("")}</div>`;
}

function renderQuantitativeChart(specification: VisualizationSpecification): string {
  const items = specification.data.items ?? [];
  const maximum = Math.max(1, ...items.map(({ value }) => Math.abs(value ?? 0)));
  const chartHeight = Math.max(120, items.length * 72 + 36);
  const chartRows = items.map((item, index) => {
    const value = item.value ?? 0;
    const width = Math.max(0, Math.round((Math.abs(value) / maximum) * 420));
    const y = index * 72 + 28;
    const valueLabel = `${String(value)}${item.unit === undefined ? "" : ` ${item.unit}`}`;
    return `<g><text x="0" y="${String(y)}" class="chart-label">${escapeHtml(item.label)}</text><rect x="170" y="${String(y - 20)}" width="${String(width)}" height="28" rx="4" class="chart-bar"></rect><text x="${String(Math.min(620, 182 + width))}" y="${String(y)}" class="chart-value">${escapeHtml(valueLabel)}</text></g>`;
  }).join("");
  const titleId = `${specification.id}-title`;
  const descriptionId = `${specification.id}-description`;
  return `<svg viewBox="0 0 700 ${String(chartHeight)}" role="img" aria-labelledby="${escapeAttribute(titleId)} ${escapeAttribute(descriptionId)}"><title id="${escapeAttribute(titleId)}">${escapeHtml(specification.title)}</title><desc id="${escapeAttribute(descriptionId)}">${escapeHtml(specification.purpose)}</desc>${chartRows}</svg>`;
}

function renderDependencyFlow(specification: VisualizationSpecification): string {
  const relationships = specification.data.relationships ?? [];
  const height = Math.max(140, relationships.length * 116 + 24);
  const rows = relationships.map((relationship, index) => {
    const y = index * 116 + 22;
    return `<g><rect x="12" y="${String(y)}" width="248" height="54" rx="8" class="flow-node"></rect><text x="28" y="${String(y + 32)}">${escapeHtml(relationship.from)}</text><line x1="270" y1="${String(y + 27)}" x2="426" y2="${String(y + 27)}" class="flow-line" marker-end="url(#arrow)"></line>${relationship.label === undefined ? "" : `<text x="348" y="${String(y + 17)}" text-anchor="middle" class="flow-label">${escapeHtml(relationship.label)}</text>`}<rect x="438" y="${String(y)}" width="248" height="54" rx="8" class="flow-node"></rect><text x="454" y="${String(y + 32)}">${escapeHtml(relationship.to)}</text></g>`;
  }).join("");
  return `<svg viewBox="0 0 700 ${String(height)}" role="img" aria-label="${escapeAttribute(specification.title)}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>${rows}</svg>`;
}

function renderEvidenceGallery(
  specification: VisualizationSpecification,
  embeddedAssets: ReadonlyMap<string, EmbeddedRasterAsset>,
): string {
  const items = specification.data.items ?? [];
  return `<ul class="evidence-gallery">${items.map((item, index) => {
    const embedded = item.sourceId === undefined ? undefined : embeddedAssets.get(item.sourceId);
    if (item.sourceId !== undefined && embedded === undefined) {
      throw new Error(
        `Cannot render evidence gallery ${specification.id}: raster asset for source ${item.sourceId} is missing.`,
      );
    }
    const frame = embedded === undefined
      ? `<div class="evidence-frame" aria-hidden="true"><span>${String(index + 1).padStart(2, "0")}</span></div>`
      : `<div class="evidence-frame"><img src="${escapeAttribute(embedded.dataUri)}" alt="${escapeAttribute(item.label)}" width="${String(embedded.width)}" height="${String(embedded.height)}"></div>`;
    return `<li>${frame}<strong>${escapeHtml(item.label)}</strong>${itemDescription(item).length === 0 ? "" : `<small>${escapeHtml(itemDescription(item))}</small>`}</li>`;
  }).join("")}</ul>`;
}

function renderVisualBody(
  specification: VisualizationSpecification,
  embeddedAssets: ReadonlyMap<string, EmbeddedRasterAsset>,
): string {
  switch (specification.family) {
    case "workstream-landscape": return renderLandscape(specification);
    case "timeline": return renderTimeline(specification);
    case "comparison-table": return renderComparison(specification);
    case "risk-matrix": return renderRiskMatrix(specification);
    case "quantitative-chart": return renderQuantitativeChart(specification);
    case "dependency-flow": return renderDependencyFlow(specification);
    case "evidence-gallery": return renderEvidenceGallery(specification, embeddedAssets);
  }
}

export function renderVisualization(
  specification: VisualizationSpecification,
  embeddedAssets: ReadonlyMap<string, EmbeddedRasterAsset> = new Map(),
): string {
  return `<figure class="visualization" data-viz-id="${escapeAttribute(specification.id)}" data-viz-family="${escapeAttribute(specification.family)}"><figcaption><strong>${escapeHtml(specification.title)}</strong><span>${escapeHtml(specification.purpose)}</span></figcaption>${renderVisualBody(specification, embeddedAssets)}${renderTextAlternative(specification.textAlternative)}</figure>`;
}

export function replaceVisualizationFamily(
  specification: VisualizationSpecification,
  family: VisualizationSpecification["family"],
): VisualizationSpecification {
  if (!specification.replacementOptions.includes(family)) {
    throw new Error(
      `${family} is not an allowed replacement for visualization ${specification.id}.`,
    );
  }
  return { ...structuredClone(specification), family };
}
