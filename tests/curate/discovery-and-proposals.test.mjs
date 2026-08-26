import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createCurationProposal,
  discoverCurationCandidates,
  validateCurationProposal,
} from "../../dist/index.js";
import {
  proposalInput,
  setupCurateLibrary,
  snapshotLibrary,
} from "./helpers/curate-fixture.mjs";

const manifestUrl = new URL("../../fixtures/curate/cases.json", import.meta.url);

test("read-only Curate discovery finds every required candidate kind and suggests every operation family", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const seed = await setupCurateLibrary("discovery");
  const before = await snapshotLibrary(seed.initialized.libraryRoot);
  const discovery = await discoverCurationCandidates({
    libraryDirectory: seed.initialized.libraryRoot,
    workspace: seed.initialized.workspace.id,
  });
  const after = await snapshotLibrary(seed.initialized.libraryRoot);

  assert.deepEqual(manifest.candidateKinds, [
    "duplicate",
    "contradiction",
    "stale-note",
    "missing-link",
    "broad-note",
  ]);
  assert.deepEqual(manifest.operationKinds, [
    "merge",
    "move",
    "rewrite",
    "relation",
    "supersession",
  ]);
  assert.deepEqual(
    [...new Set(discovery.candidates.map(({ kind }) => kind))].sort(),
    [...manifest.candidateKinds].sort(),
  );
  assert.deepEqual(
    [...new Set(discovery.candidates.flatMap(({ suggestedOperationKinds }) => suggestedOperationKinds))].sort(),
    [...manifest.operationKinds].sort(),
  );
  assert.ok(discovery.candidates.every(({ noteIds }) => noteIds.length > 0));
  assert.ok(discovery.candidates.every(({ noteHashes, noteIds }) => (
    noteIds.every((id) => /^[a-f0-9]{64}$/u.test(noteHashes[id]))
  )));
  assert.ok(discovery.candidates.every(({ workspaceId }) => workspaceId === seed.initialized.workspace.id));
  assert.deepEqual(after, before, "candidate discovery must not mutate any Work Library byte");
});

test("Curate proposals are invariant-checked against selected candidates and current note hashes", async () => {
  const seed = await setupCurateLibrary("proposal");
  const discovery = await discoverCurationCandidates({
    libraryDirectory: seed.initialized.libraryRoot,
    workspace: seed.initialized.workspace.id,
  });
  const proposal = createCurationProposal(
    discovery,
    proposalInput(seed, discovery),
    "2026-08-26T17:10:00Z",
  );

  assert.deepEqual(
    proposal.operations.map(({ kind }) => kind).sort(),
    ["merge", "move", "relation", "rewrite", "supersession"],
  );
  assert.deepEqual(validateCurationProposal(proposal, discovery), { valid: true, errors: [] });
  assert.ok(Object.values(proposal.expectedNoteHashes).every((value) => /^[a-f0-9]{64}$/u.test(value)));

  const unknownCandidate = structuredClone(proposal);
  unknownCandidate.candidateIds.push("curcand_not-discovered");
  assert.equal(validateCurationProposal(unknownCandidate, discovery).valid, false);
  assert.match(validateCurationProposal(unknownCandidate, discovery).errors.join("\n"), /unknown candidate/u);

  const crossWorkspace = structuredClone(proposal);
  crossWorkspace.workspaceId = "wsp_90000000-0000-4000-8000-000000000009";
  assert.equal(validateCurationProposal(crossWorkspace, discovery).valid, false);
  assert.match(validateCurationProposal(crossWorkspace, discovery).errors.join("\n"), /Workspace/u);

  const outsideCandidate = structuredClone(proposal);
  outsideCandidate.operations[0].duplicateIds = [seed.notes.staleOriginal.id];
  assert.equal(validateCurationProposal(outsideCandidate, discovery).valid, false);
  assert.match(validateCurationProposal(outsideCandidate, discovery).errors.join("\n"), /selected candidate/u);

  const staleHash = structuredClone(proposal);
  staleHash.expectedNoteHashes[seed.notes.duplicateFirst.id] = "0".repeat(64);
  assert.equal(validateCurationProposal(staleHash, discovery).valid, false);
  assert.match(validateCurationProposal(staleHash, discovery).errors.join("\n"), /changed after/u);
});

test("archived Workspace curation requires explicit selection", async () => {
  const seed = await setupCurateLibrary("archived");
  const { setWorkspaceArchived } = await import("../../dist/index.js");
  await setWorkspaceArchived(
    seed.initialized.libraryRoot,
    seed.initialized.workspace.id,
    true,
    "2026-08-26T17:11:00Z",
  );
  await assert.rejects(
    discoverCurationCandidates({
      libraryDirectory: seed.initialized.libraryRoot,
      workspace: seed.initialized.workspace.id,
    }),
    /archived Workspace/u,
  );
  const selected = await discoverCurationCandidates({
    libraryDirectory: seed.initialized.libraryRoot,
    workspace: seed.initialized.workspace.id,
    includeArchived: true,
  });
  assert.equal(selected.workspace.archived, true);
  assert.ok(selected.candidates.length > 0);
});
