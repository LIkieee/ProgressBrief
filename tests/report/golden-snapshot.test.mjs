import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { projectReportForExport } from "../../dist/contracts/export-projection.js";
import { isStableId } from "../../dist/contracts/ids.js";
import { validateReportModel } from "../../dist/contracts/report-semantics.js";

const goldenUrl = new URL(
  "../../fixtures/snapshot-three-workstreams/golden-report-model.json",
  import.meta.url,
);

async function golden() {
  return JSON.parse(await readFile(goldenUrl, "utf8"));
}

test("the committed golden model is a complete schema-valid Snapshot", async () => {
  const report = await golden();
  assert.deepEqual(validateReportModel(report), { valid: true, errors: [] });
  assert.equal(report.mode, "snapshot");
  assert.deepEqual(
    report.sections.map(({ title }) => title),
    ["Orientation", "Movement", "Attention", "Forward view"],
  );
  assert.ok(report.components.some(({ kind }) => kind === "evidence-disclosure"));
  assert.ok(report.visualizations.length >= 1);
  assert.ok(report.creatorOnly.omissions.some(({ reason }) => /permissions cleanup/u.test(reason)));
});

test("the golden Snapshot preserves stable IDs and claim-to-source relationships", async () => {
  const report = await golden();
  const sourceIds = new Set(report.evidence.sources.map(({ id }) => id));

  assert.equal(isStableId("report", report.id), true);
  assert.ok(report.sections.every(({ id }) => isStableId("section", id)));
  assert.ok(report.components.every(({ id }) => isStableId("component", id)));
  assert.ok(report.claims.every(({ id }) => isStableId("claim", id)));
  assert.ok(report.evidence.sources.every(({ id }) => isStableId("source", id)));
  assert.ok(report.visualizations.every(({ id }) => isStableId("visualization", id)));
  assert.ok(report.claims.every(({ sourceIds: ids }) => ids.length > 0 && ids.every((id) => sourceIds.has(id))));
  assert.ok(report.claims.filter(({ consequential }) => consequential).length >= 5);
});

test("the golden Snapshot communicates multiple workstreams, outcomes, attention, and next steps", async () => {
  const report = await golden();
  const exportableText = JSON.stringify(projectReportForExport(report));

  for (const phrase of [
    "Enterprise rollout",
    "Reconciliation pipeline",
    "18 minutes",
    "6 minutes",
    "data-retention review",
    "first cohort by Friday",
    "validate alert thresholds",
  ]) {
    assert.match(exportableText, new RegExp(phrase, "iu"));
  }
  assert.doesNotMatch(exportableText, /permissions cleanup|<script>|ghp_fixture|\/Users\/casey/u);
});
