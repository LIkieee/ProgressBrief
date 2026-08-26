import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { assertValidDocument } from "../../dist/contracts/schema-validator.js";

const root = new URL("../../", import.meta.url);
const fixtureRoot = "fixtures/snapshot-three-workstreams/";

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

test("the Snapshot fixture records all eleven distinct required cases", async () => {
  const manifest = await readJson(`${fixtureRoot}fixture-manifest.json`);
  const requiredCases = [
    "absolute-path-sentinel",
    "ambiguous-activity",
    "blocker",
    "decision-with-rationale",
    "duplicated-or-superseded-memory",
    "explicit-ask",
    "fake-credential",
    "malicious-html",
    "next-period-priority",
    "reusable-knowledge-note",
    "strongly-evidenced-outcome",
  ];

  assert.equal(manifest.schemaVersion, "1.0.0");
  assert.equal(manifest.synthetic, true);
  assert.equal(manifest.workstreams.length, 3);
  assert.deepEqual(
    manifest.cases.map(({ category }) => category).toSorted(),
    requiredCases,
  );
  assert.equal(new Set(manifest.cases.map(({ id }) => id)).size, 11);

  for (const fixtureCase of manifest.cases) {
    await access(new URL(`${fixtureRoot}${fixtureCase.sourcePath}`, root));
    assert.ok(fixtureCase.expectedBehavior.length > 12);
  }
});

test("the fixture includes mixed notes, a local file, a real raster screenshot, and recorded GitHub PR metadata", async () => {
  const manifest = await readJson(`${fixtureRoot}fixture-manifest.json`);
  const sourceKinds = new Set(manifest.sources.map(({ kind }) => kind));
  assert.deepEqual(
    [...sourceKinds].toSorted(),
    ["github-pull-request", "local-file", "messy-notes", "screenshot"],
  );

  const screenshot = await readFile(new URL(`${fixtureRoot}input/rollout-dashboard.png`, root));
  assert.deepEqual([...screenshot.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(screenshot.byteLength > 1_000);

  const pullRequest = await readJson(`${fixtureRoot}input/github/pr-184.json`);
  assert.equal(pullRequest.synthetic, true);
  assert.equal(pullRequest.state, "MERGED");
  assert.ok(pullRequest.changedFiles.length >= 2);
  assert.ok(pullRequest.reviews.length >= 1);
  assert.ok(pullRequest.linkedIssues.length >= 1);
  assert.match(pullRequest.url, /^https:\/\/github\.example\.invalid\//u);
});

test("fixture Work Library and normalized evidence documents validate", async () => {
  const evidence = await readJson(`${fixtureRoot}evidence.json`);
  const workspace = await readJson(`${fixtureRoot}library/workspace.json`);
  const worklog = await readJson(`${fixtureRoot}library/worklog-entry.json`);
  const notes = await Promise.all([
    readJson(`${fixtureRoot}library/knowledge/replay-safety.json`),
    readJson(`${fixtureRoot}library/knowledge/worker-count-current.json`),
    readJson(`${fixtureRoot}library/knowledge/worker-count-superseded.json`),
  ]);

  assertValidDocument("evidence", evidence);
  assertValidDocument("workspace", workspace);
  assertValidDocument("worklog-entry", worklog);
  for (const note of notes) assertValidDocument("knowledge-note", note);

  assert.equal(evidence.workspaceId, workspace.id);
  assert.ok(evidence.sources.every((source) => source.workspaceId === workspace.id));
  assert.ok(notes.every((note) => note.workspaceId === workspace.id));

  const projectIds = new Set(workspace.projects.map(({ id }) => id));
  const sourceIds = new Set(evidence.sources.map(({ id }) => id));
  const knowledgeIds = new Set(notes.map(({ id }) => id));
  assert.ok(evidence.sources.flatMap(({ projectIds: ids = [] }) => ids).every((id) => projectIds.has(id)));
  assert.ok(worklog.projectIds.every((id) => projectIds.has(id)));
  assert.ok(worklog.sourceIds.every((id) => sourceIds.has(id)));
  assert.ok(worklog.relatedKnowledgeIds.every((id) => knowledgeIds.has(id)));
  assert.ok(notes.flatMap(({ projectIds: ids }) => ids).every((id) => projectIds.has(id)));
  assert.ok(notes.flatMap(({ sourceIds: ids }) => ids).every((id) => sourceIds.has(id)));
  assert.ok(
    notes
      .flatMap(({ relationships }) => relationships)
      .every(({ targetId }) => knowledgeIds.has(targetId)),
  );
});
