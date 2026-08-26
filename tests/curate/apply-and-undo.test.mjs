import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  applyCurationProposal,
  createCurationProposal,
  discoverCurationCandidates,
  readKnowledgeNotes,
  undoLastMutation,
} from "../../dist/index.js";
import {
  proposalInput,
  setupCurateLibrary,
  snapshotLibrary,
} from "./helpers/curate-fixture.mjs";

async function prepared(name) {
  const seed = await setupCurateLibrary(name);
  const discovery = await discoverCurationCandidates({
    libraryDirectory: seed.initialized.libraryRoot,
    workspace: seed.initialized.workspace.id,
  });
  const proposal = createCurationProposal(
    discovery,
    proposalInput(seed, discovery),
    "2026-08-26T17:10:00Z",
  );
  return { seed, proposal };
}

test("omitted or rejected approval leaves every library byte and the journal unchanged", async () => {
  const { seed, proposal } = await prepared("rejected");
  const before = await snapshotLibrary(seed.initialized.libraryRoot);
  const omitted = await applyCurationProposal({
    libraryDirectory: seed.initialized.libraryRoot,
    workspace: seed.initialized.workspace.id,
    proposal,
  });
  assert.equal(omitted.status, "rejected");
  assert.deepEqual(await snapshotLibrary(seed.initialized.libraryRoot), before);

  const rejected = await applyCurationProposal({
    libraryDirectory: seed.initialized.libraryRoot,
    workspace: seed.initialized.workspace.id,
    proposal,
    approved: false,
  });
  assert.equal(rejected.status, "rejected");
  assert.match(rejected.acknowledgement, /no Work Library files changed/u);
  assert.deepEqual(
    await snapshotLibrary(seed.initialized.libraryRoot),
    before,
    "rejecting a proposal must not even append to the mutation journal",
  );
});

test("approved merge, move, rewrite, relation, and supersession apply atomically while preserving note history", async () => {
  const { seed, proposal } = await prepared("approved");
  const before = await snapshotLibrary(seed.initialized.libraryRoot);
  const beforeKnowledge = Object.fromEntries(
    Object.entries(before).filter(([path]) => path.includes("/knowledge/")),
  );

  const result = await applyCurationProposal({
    libraryDirectory: seed.initialized.libraryRoot,
    workspace: seed.initialized.workspace.id,
    proposal,
    approved: true,
    now: "2026-08-26T17:12:00Z",
  });
  assert.equal(result.status, "applied");
  assert.match(result.acknowledgement, /applied in Northstar Systems/u);
  assert.ok(result.mutationId.startsWith("mut_"));

  const notes = await readKnowledgeNotes(seed.initialized.libraryRoot, seed.initialized.workspace.id);
  const byId = new Map(notes.map((note) => [note.id, note]));
  const canonical = byId.get(seed.notes.duplicateFirst.id);
  const duplicate = byId.get(seed.notes.duplicateSecond.id);
  assert.equal(duplicate.status, "superseded");
  assert.ok(canonical.relationships.some(({ type, targetId }) => (
    type === "supersedes" && targetId === duplicate.id
  )));
  assert.ok(canonical.topics.includes("idempotency"));

  const predecessor = byId.get(seed.notes.contradictionOld.id);
  const successor = byId.get(seed.notes.contradictionNew.id);
  assert.equal(predecessor.status, "superseded");
  assert.ok(successor.relationships.some(({ type, targetId }) => (
    type === "supersedes" && targetId === predecessor.id
  )));

  const linkedFirst = byId.get(seed.notes.missingLinkFirst.id);
  const linkedSecond = byId.get(seed.notes.missingLinkSecond.id);
  assert.ok(linkedFirst.relationships.some(({ type, targetId }) => type === "related" && targetId === linkedSecond.id));
  assert.ok(linkedSecond.relationships.some(({ type, targetId }) => type === "related" && targetId === linkedFirst.id));

  const rewritten = byId.get(seed.notes.broad.id);
  assert.equal(rewritten.id, seed.notes.broad.id);
  assert.equal(rewritten.createdAt, seed.notes.broad.createdAt);
  assert.equal(rewritten.title, "Replay readiness guide");
  assert.deepEqual(rewritten.projectIds, [seed.projectIds.second]);
  assert.deepEqual(rewritten.topics, ["replay-readiness", "rollback"]);
  assert.equal(notes.length, Object.keys(beforeKnowledge).length, "Curate must preserve every note file");

  const journal = JSON.parse(await readFile(
    join(seed.initialized.libraryRoot, "config", "mutation-journal.json"),
    "utf8",
  ));
  const mutation = journal.mutations.at(-1);
  assert.equal(mutation.id, result.mutationId);
  assert.equal(mutation.status, "committed");
  assert.match(mutation.description, /Curate/u);
  assert.equal(mutation.changes.length, result.changedNoteIds.length);

  await undoLastMutation(
    seed.initialized.libraryRoot,
    seed.initialized.workspace.id,
    "2026-08-26T17:13:00Z",
  );
  const restored = await snapshotLibrary(seed.initialized.libraryRoot);
  assert.deepEqual(
    Object.fromEntries(Object.entries(restored).filter(([path]) => path.includes("/knowledge/"))),
    beforeKnowledge,
    "undo must restore every curated Knowledge Note byte-for-byte",
  );
  const undoneJournal = JSON.parse(await readFile(
    join(seed.initialized.libraryRoot, "config", "mutation-journal.json"),
    "utf8",
  ));
  assert.equal(undoneJournal.mutations.at(-1).status, "undone");
});

test("approval fails closed when a proposed note changes after discovery", async () => {
  const { seed, proposal } = await prepared("conflict");
  const { captureMemory } = await import("../../dist/index.js");
  await captureMemory({
    libraryDirectory: seed.initialized.libraryRoot,
    workspace: seed.initialized.workspace.id,
    text: "Remember: replay callbacks require signed delivery receipts.",
    now: "2026-08-26T17:11:00Z",
    knowledge: {
      title: seed.notes.duplicateFirst.title,
      body: seed.notes.duplicateFirst.body,
      examples: ["Record the signed receipt before acknowledging delivery."],
    },
  });
  const beforeApproval = await snapshotLibrary(seed.initialized.libraryRoot);
  await assert.rejects(
    applyCurationProposal({
      libraryDirectory: seed.initialized.libraryRoot,
      workspace: seed.initialized.workspace.id,
      proposal,
      approved: true,
      now: "2026-08-26T17:12:00Z",
    }),
    /changed after the Curate proposal/u,
  );
  assert.deepEqual(await snapshotLibrary(seed.initialized.libraryRoot), beforeApproval);
});
