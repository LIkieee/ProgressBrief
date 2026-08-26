import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  createCurationProposal,
  readKnowledgeNotes,
} from "../../dist/index.js";
import {
  proposalInput,
  setupCurateLibrary,
  snapshotLibrary,
} from "./helpers/curate-fixture.mjs";

const execFileAsync = promisify(execFile);
const cli = new URL("../../dist/cli/main.js", import.meta.url);

test("the CLI discovers candidates and requires an explicit true approval before applying a proposal", async () => {
  const seed = await setupCurateLibrary("cli");
  const discovered = await execFileAsync(process.execPath, [
    cli.pathname,
    "memory",
    "curate",
    "--library",
    seed.initialized.libraryRoot,
    "--workspace",
    seed.initialized.workspace.id,
  ]);
  const discovery = JSON.parse(discovered.stdout);
  assert.deepEqual(
    [...new Set(discovery.candidates.map(({ kind }) => kind))].sort(),
    ["broad-note", "contradiction", "duplicate", "missing-link", "stale-note"],
  );

  const proposal = createCurationProposal(
    discovery,
    proposalInput(seed, discovery),
    "2026-08-26T17:10:00Z",
  );
  const proposalPath = join(seed.directory, "curation-proposal.json");
  await writeFile(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
  const before = await snapshotLibrary(seed.initialized.libraryRoot);

  const rejected = await execFileAsync(process.execPath, [
    cli.pathname,
    "memory",
    "curate",
    "--library",
    seed.initialized.libraryRoot,
    "--workspace",
    seed.initialized.workspace.id,
    "--proposal",
    proposalPath,
  ]);
  assert.match(rejected.stdout, /was not applied; no Work Library files changed/u);
  assert.deepEqual(await snapshotLibrary(seed.initialized.libraryRoot), before);

  const applied = await execFileAsync(process.execPath, [
    cli.pathname,
    "memory",
    "curate",
    "--library",
    seed.initialized.libraryRoot,
    "--workspace",
    seed.initialized.workspace.id,
    "--proposal",
    proposalPath,
    "--approve",
    "true",
  ]);
  assert.match(applied.stdout, /applied in Northstar Systems/u);
  const notes = await readKnowledgeNotes(seed.initialized.libraryRoot, seed.initialized.workspace.id);
  assert.equal(notes.find(({ id }) => id === seed.notes.duplicateSecond.id).status, "superseded");
});
