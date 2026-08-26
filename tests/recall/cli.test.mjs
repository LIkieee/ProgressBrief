import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import { setupRecallFixture } from "./helpers/recall-fixture.mjs";

const execFileAsync = promisify(execFile);
const cli = new URL("../../dist/cli/main.js", import.meta.url);

test("the CLI exposes candidate JSON for agent reranking and a concise grounded answer", async () => {
  const fixture = await setupRecallFixture("cli");
  const candidates = await execFileAsync(process.execPath, [
    cli.pathname,
    "memory",
    "recall",
    "--library",
    fixture.libraryRoot,
    "--workspace",
    fixture.workspaces.northstar.slug,
    "--query",
    "How do I prevent repeated callbacks during a staging stress run?",
    "--format",
    "candidates",
  ]);
  const parsed = JSON.parse(candidates.stdout);
  assert.equal(parsed.candidates[0].id, fixture.records.replay.id);
  assert.equal(candidates.stdout.includes(fixture.libraryRoot), false);

  const answer = await execFileAsync(process.execPath, [
    cli.pathname,
    "memory",
    "recall",
    "--library",
    fixture.libraryRoot,
    "--workspace",
    fixture.workspaces.northstar.slug,
    "--query",
    "staging reconciliation guidance",
    "--rerank",
    `${fixture.records.currentWorkerLimit.id},${fixture.records.replay.id}`,
  ]);
  assert.match(answer.stdout, /four concurrent reconciliation workers/iu);
  assert.match(answer.stdout, /\]\(workspaces\/northstar-systems\/knowledge\//u);
  assert.equal(answer.stdout.includes(fixture.libraryRoot), false);
  assert.doesNotMatch(answer.stdout, /<html/iu);
});
