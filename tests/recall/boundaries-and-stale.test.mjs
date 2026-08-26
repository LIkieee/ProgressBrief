import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { recallFromLibrary, setWorkspaceArchived } from "../../dist/index.js";
import { serializeKnowledgeNote } from "../../dist/library/markdown.js";

import { setupRecallFixture } from "./helpers/recall-fixture.mjs";

const root = new URL("../../", import.meta.url);

async function query(id) {
  const fixture = JSON.parse(await readFile(new URL("fixtures/recall/cases.json", root), "utf8"));
  return fixture.cases.find((candidate) => candidate.id === id).query;
}

test("an ambiguous Workspace asks once and exposes no cross-Workspace candidate", async () => {
  const fixture = await setupRecallFixture("ambiguous");
  const result = await recallFromLibrary({
    libraryDirectory: fixture.libraryRoot,
    query: await query("ambiguous-workspace"),
  });

  assert.equal(result.status, "needs-workspace");
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.workspaceChoices.map(({ name }) => name), ["Northstar Systems", "Personal"]);
  assert.ok(result.workspaceChoices.every(({ name }) => name !== "Archived Client"));
  assert.match(result.answer, /Which Workspace/iu);

  await setWorkspaceArchived(
    fixture.libraryRoot,
    fixture.workspaces.personal.id,
    true,
    "2026-08-27T12:00:00Z",
  );
  const unambiguous = await recallFromLibrary({
    libraryDirectory: fixture.libraryRoot,
    query: "replay-safe staging callback",
  });
  assert.equal(unambiguous.status, "found");
  assert.equal(unambiguous.candidates[0].workspaceId, fixture.workspaces.northstar.id);

  const isolated = await recallFromLibrary({
    libraryDirectory: fixture.libraryRoot,
    workspace: fixture.workspaces.northstar.id,
    query: "portfolio interview outline",
  });
  assert.equal(isolated.status, "no-results");
  assert.deepEqual(isolated.candidates, []);
});

test("archived Workspaces stay excluded unless their exact Workspace is explicitly included", async () => {
  const fixture = await setupRecallFixture("archived");
  const archivedQuery = await query("archived-workspace");
  await assert.rejects(
    recallFromLibrary({
      libraryDirectory: fixture.libraryRoot,
      workspace: fixture.workspaces.archived.id,
      query: archivedQuery,
    }),
    /archived Workspace/u,
  );
  const explicit = await recallFromLibrary({
    libraryDirectory: fixture.libraryRoot,
    workspace: fixture.workspaces.archived.id,
    includeArchived: true,
    query: archivedQuery,
  });
  assert.equal(explicit.status, "found");
  assert.deepEqual(explicit.candidates.map(({ id }) => id), [fixture.records.archived.id]);
});

test("current guidance wins while consequential superseded history remains visible", async () => {
  const fixture = await setupRecallFixture("stale");
  const result = await recallFromLibrary({
    libraryDirectory: fixture.libraryRoot,
    workspace: fixture.workspaces.northstar.id,
    query: await query("stale-note"),
  });

  assert.equal(result.status, "found");
  assert.equal(result.candidates[0].id, fixture.records.currentWorkerLimit.id);
  assert.notEqual(result.candidates[0].id, fixture.records.oldWorkerLimit.id);
  assert.deepEqual(result.candidates[0].supersededIds, [fixture.records.oldWorkerLimit.id]);
  assert.match(result.answer, /four concurrent reconciliation workers/iu);
  assert.match(result.answer, /supersedes older guidance/iu);
  assert.match(result.answer, /Use eight reconciliation workers/iu);
});

test("a supersession cycle fails closed instead of hanging or choosing arbitrary guidance", async () => {
  const fixture = await setupRecallFixture("cycle");
  const cyclicOld = {
    ...fixture.records.oldWorkerLimit,
    status: "superseded",
    relationships: [{ type: "supersedes", targetId: fixture.records.currentWorkerLimit.id }],
    updatedAt: "2026-08-26T12:00:00Z",
  };
  await writeFile(
    join(
      fixture.libraryRoot,
      "workspaces",
      fixture.workspaces.northstar.slug,
      "knowledge",
      `${cyclicOld.id}.md`,
    ),
    serializeKnowledgeNote(cyclicOld),
    "utf8",
  );

  await assert.rejects(
    recallFromLibrary({
      libraryDirectory: fixture.libraryRoot,
      workspace: fixture.workspaces.northstar.id,
      query: "reconciliation worker limit",
    }),
    /supersession cycle/u,
  );
});

test("a no-result Recall returns no candidate and makes no low-confidence guess", async () => {
  const fixture = await setupRecallFixture("none");
  const result = await recallFromLibrary({
    libraryDirectory: fixture.libraryRoot,
    workspace: fixture.workspaces.northstar.id,
    query: await query("no-result"),
  });

  assert.equal(result.status, "no-results");
  assert.deepEqual(result.candidates, []);
  assert.match(result.answer, /couldn.t find a matching Work Library record/iu);
  assert.doesNotMatch(result.answer, /replay|worker|rollout/iu);
});
