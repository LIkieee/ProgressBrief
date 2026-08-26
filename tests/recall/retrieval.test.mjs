import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  recallFromLibrary,
  searchRecallCandidates,
} from "../../dist/index.js";

import { setupRecallFixture } from "./helpers/recall-fixture.mjs";

const root = new URL("../../", import.meta.url);

async function cases() {
  return JSON.parse(await readFile(new URL("fixtures/recall/cases.json", root), "utf8")).cases;
}

test("the five required Recall cases are explicit deterministic fixtures", async () => {
  assert.deepEqual(
    (await cases()).map(({ id }) => id).sort(),
    ["ambiguous-workspace", "archived-workspace", "no-result", "paraphrase", "stale-note"],
  );
});

test("portable lexical retrieval indexes paths, metadata, headings, and bodies", async () => {
  const fixture = await setupRecallFixture("fields");
  const common = {
    libraryDirectory: fixture.libraryRoot,
    workspace: fixture.workspaces.northstar.id,
  };
  const [path, metadata, heading, body] = await Promise.all([
    searchRecallCandidates({ ...common, query: "runbooks" }),
    searchRecallCandidates({ ...common, query: "load-testing" }),
    searchRecallCandidates({ ...common, query: "replay-safe mode" }),
    searchRecallCandidates({ ...common, query: "callback fixture twice" }),
  ]);

  assert.equal(path.candidates[0].id, fixture.records.replay.id);
  assert.ok(path.candidates[0].matchedFields.includes("path"));
  assert.equal(metadata.candidates[0].id, fixture.records.replay.id);
  assert.ok(metadata.candidates[0].matchedFields.includes("metadata"));
  assert.equal(heading.candidates[0].id, fixture.records.replay.id);
  assert.ok(heading.candidates[0].matchedFields.includes("heading"));
  assert.equal(body.candidates[0].id, fixture.records.replay.id);
  assert.ok(body.candidates[0].matchedFields.includes("body"));
});

test("query expansion answers a paraphrase with grounded note and source references", async () => {
  const fixture = await setupRecallFixture("paraphrase");
  const paraphrase = (await cases()).find(({ id }) => id === "paraphrase");
  const result = await recallFromLibrary({
    libraryDirectory: fixture.libraryRoot,
    workspace: fixture.workspaces.northstar.slug,
    query: paraphrase.query,
  });

  assert.equal(result.status, "found");
  assert.equal(result.candidates[0].id, fixture.records.replay.id);
  assert.ok(result.expandedTerms.includes("replay"));
  assert.match(result.answer, /replay-safe mode/iu);
  assert.match(result.answer, /\[Use replay-safe mode for staging load tests\]\(workspaces\/northstar-systems\/knowledge\/runbooks\/callback-playbook\.md\)/u);
  assert.deepEqual(result.candidates[0].sourceIds, fixture.records.replay.sourceIds);
  assert.doesNotMatch(result.answer, /<html|<script/iu);
});
