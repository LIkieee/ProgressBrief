import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  captureMemory,
  initializeWorkLibrary,
  readKnowledgeNotes,
  readWorklogEntries,
  undoLastMutation,
} from "../../dist/index.js";

async function setup(name, workspaceName = "Northstar Systems", kind = "employer") {
  const directory = await mkdtemp(join(tmpdir(), `progressbrief-${name}-`));
  return initializeWorkLibrary({
    libraryDirectory: join(directory, "library"),
    workspaceName,
    workspaceKind: kind,
    projectName: "Reconciliation",
    now: "2026-08-26T15:00:00Z",
  });
}

function remember(initialized, overrides = {}) {
  return captureMemory({
    libraryDirectory: initialized.libraryRoot,
    workspace: initialized.workspace.id,
    text: "Remember: staging replays require safe mode.",
    now: "2026-08-26T15:05:00Z",
    knowledge: {
      title: "Use safe mode for staging replays",
      topics: ["replays", "staging"],
      body: "Staging replays require safe mode.",
      examples: ["Enable safe mode before timing a replay."],
      ...overrides,
    },
  });
}

test("search-before-write skips exact repeats and automatically enriches useful examples or sources without replacing identity", async () => {
  const initialized = await setup("knowledge");
  const created = await remember(initialized);
  const repeated = await remember(initialized);

  assert.equal(repeated.knowledgeAction, "duplicate-skipped");
  assert.equal(repeated.knowledgeNote.id, created.knowledgeNote.id);
  assert.equal((await readKnowledgeNotes(initialized.libraryRoot, initialized.workspace.id)).length, 1);

  const enriched = await remember(initialized, {
    examples: ["Use the safe flag in the synthetic replay harness."],
    sourceIds: ["src_30000000-0000-4000-8000-000000000003"],
  });
  assert.equal(enriched.knowledgeAction, "enriched");
  assert.equal(enriched.knowledgeNote.id, created.knowledgeNote.id);
  assert.equal(enriched.knowledgeNote.createdAt, created.knowledgeNote.createdAt);
  assert.match(enriched.knowledgeNote.examples.join("\n"), /synthetic replay harness/u);
  assert.equal(enriched.knowledgeNote.sourceIds.length, 2);
});

test("similar wording without an explicit relationship remains a distinct Knowledge Note", async () => {
  const initialized = await setup("distinct");
  const original = await remember(initialized);
  const distinct = await remember(initialized, {
    title: "Safe staging replay configuration",
    body: "Safe mode is useful when replaying staging traffic.",
    topics: ["replays", "staging"],
  });

  assert.equal(distinct.knowledgeAction, "created");
  assert.notEqual(distinct.knowledgeNote.id, original.knowledgeNote.id);
  assert.equal((await readKnowledgeNotes(initialized.libraryRoot, initialized.workspace.id)).length, 2);
});

test("related and superseding knowledge are linked while meaningful history is preserved", async () => {
  const initialized = await setup("relations");
  const original = await remember(initialized);

  const related = await remember(initialized, {
    title: "Connect to VPN before safe replay",
    body: "Connect to the staging VPN before enabling safe replay mode.",
    topics: ["replays", "vpn"],
    resolution: { action: "related", targetId: original.knowledgeNote.id },
  });
  assert.equal(related.knowledgeAction, "related-created");
  assert.notEqual(related.knowledgeNote.id, original.knowledgeNote.id);

  const replacement = await remember(initialized, {
    title: "Use guarded mode for staging replays",
    body: "Staging replays now require guarded mode instead of safe mode.",
    topics: ["replays", "staging"],
    resolution: { action: "supersede", targetId: original.knowledgeNote.id },
  });
  assert.equal(replacement.knowledgeAction, "superseded");
  assert.deepEqual(replacement.knowledgeNote.relationships, [
    { type: "supersedes", targetId: original.knowledgeNote.id },
  ]);

  const notes = await readKnowledgeNotes(initialized.libraryRoot, initialized.workspace.id);
  const preserved = notes.find(({ id }) => id === original.knowledgeNote.id);
  const relatedTarget = notes.find(({ id }) => id === related.knowledgeNote.id);
  assert.equal(preserved.status, "superseded");
  assert.ok(preserved.relationships.some(({ type, targetId }) => type === "related" && targetId === related.knowledgeNote.id));
  assert.ok(relatedTarget.relationships.some(({ type, targetId }) => type === "related" && targetId === original.knowledgeNote.id));
  assert.equal(notes.length, 3);
});

test("undo reverses only the last ProgressBrief mutation in the active Workspace", async () => {
  const first = await setup("undo", "Employer", "employer");
  const second = await initializeWorkLibrary({
    libraryDirectory: first.libraryRoot,
    workspaceName: "Personal",
    workspaceKind: "personal",
    projectName: "Career notes",
    now: "2026-08-26T15:01:00Z",
  });
  await remember(first);
  await captureMemory({
    libraryDirectory: second.libraryRoot,
    workspace: second.workspace.id,
    text: "Capture: drafted a portfolio outline.",
    occurredOn: "2026-08-26",
    now: "2026-08-26T15:06:00Z",
  });

  const undo = await undoLastMutation(first.libraryRoot, first.workspace.id, "2026-08-26T15:07:00Z");
  assert.match(undo.acknowledgement, /Undid the last ProgressBrief mutation in Employer/u);
  assert.equal((await readKnowledgeNotes(first.libraryRoot, first.workspace.id)).length, 0);
  assert.equal((await readWorklogEntries(second.libraryRoot, second.workspace.id)).length, 1);
});
