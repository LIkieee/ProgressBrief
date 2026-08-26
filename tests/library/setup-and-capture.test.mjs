import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  captureMemory,
  classifyMemoryRequest,
  initializeWorkLibrary,
  isStableId,
  readKnowledgeNotes,
  readWorklogEntries,
} from "../../dist/index.js";

const execFileAsync = promisify(execFile);

async function temporaryDirectory(name) {
  return mkdtemp(join(tmpdir(), `progressbrief-${name}-`));
}

test("classifies Capture, Remember, and a mixed fragment without a report interview", () => {
  assert.deepEqual(
    classifyMemoryRequest("Capture this for my weekly update: we finished the migration."),
    { destinations: ["worklog"], text: "we finished the migration." },
  );
  assert.deepEqual(
    classifyMemoryRequest("Remember: staging migrations require VPN access."),
    { destinations: ["knowledge"], text: "staging migrations require VPN access." },
  );
  assert.deepEqual(
    classifyMemoryRequest(
      "Capture: we finished the migration, and staging migrations require VPN access.",
    ),
    {
      destinations: ["worklog", "knowledge"],
      text: "we finished the migration, and staging migrations require VPN access.",
    },
  );
});

test("first persistence creates a visible Markdown library and canonical repository association", async () => {
  const directory = await temporaryDirectory("setup");
  const repository = join(directory, "synthetic-repository");
  await execFileAsync("git", ["init", repository]);
  await execFileAsync("git", ["-C", repository, "remote", "add", "origin", "git@github.com:example/replay.git"]);

  const initialized = await initializeWorkLibrary({
    libraryDirectory: join(directory, "ProgressBrief Library"),
    workspaceName: "Northstar Systems",
    workspaceKind: "employer",
    projectName: "Reconciliation pipeline",
    repositoryPath: repository,
    now: "2026-08-26T15:00:00Z",
  });

  assert.equal(initialized.created, true);
  assert.equal(initialized.workspace.defaultVisibility, "internal");
  assert.equal(initialized.workspace.projects.length, 1);
  assert.equal(
    initialized.workspace.projects[0].repositoryAssociations[0].resolvedRealPath,
    await realpath(repository),
  );
  assert.equal(
    initialized.workspace.projects[0].repositoryAssociations[0].canonicalRemoteUrl,
    "https://github.com/example/replay",
  );
  assert.equal(isStableId("workspace", initialized.workspace.id), true);
  assert.equal(isStableId("project", initialized.workspace.projects[0].id), true);

  const workspaceMarkdown = await readFile(
    join(initialized.libraryRoot, "workspaces", "northstar-systems", "workspace.md"),
    "utf8",
  );
  assert.match(workspaceMarkdown, /^---\n/u);
  assert.match(workspaceMarkdown, /# Northstar Systems/u);
  assert.match(workspaceMarkdown, /Reconciliation pipeline/u);
  assert.match(workspaceMarkdown, /defaultVisibility: internal/u);
});

test("Capture and Remember persist linked, schema-valid, human-readable records with a one-line acknowledgement", async () => {
  const directory = await temporaryDirectory("capture");
  const initialized = await initializeWorkLibrary({
    libraryDirectory: join(directory, "library"),
    workspaceName: "Northstar Systems",
    workspaceKind: "employer",
    projectName: "Migration",
    now: "2026-08-26T15:00:00Z",
  });

  const result = await captureMemory({
    libraryDirectory: initialized.libraryRoot,
    workspace: initialized.workspace.id,
    text: "Capture: we finished the migration, and staging migrations require VPN access.",
    occurredOn: "2026-08-26",
    now: "2026-08-26T15:05:00Z",
    knowledge: {
      title: "Use VPN for staging migrations",
      topics: ["migrations", "staging"],
      body: "Staging migrations require VPN access.",
      caveats: ["Connect before running the staging migration command."],
    },
  });

  assert.deepEqual(result.destinations, ["worklog", "knowledge"]);
  assert.equal(result.acknowledgement, "Saved to Northstar Systems: Worklog + Knowledge.");
  assert.doesNotMatch(result.acknowledgement, /\n/u);
  assert.equal(result.knowledgeAction, "created");
  assert.equal(result.worklogEntry.relatedKnowledgeIds[0], result.knowledgeNote.id);
  assert.equal(result.worklogEntry.workspaceId, result.knowledgeNote.workspaceId);
  assert.equal(result.worklogEntry.visibility, "internal");
  assert.equal(result.knowledgeNote.visibility, "internal");
  assert.equal(result.worklogEntry.sourceIds.length, 1);
  assert.deepEqual(result.worklogEntry.sourceIds, result.knowledgeNote.sourceIds);

  const [entries, notes] = await Promise.all([
    readWorklogEntries(initialized.libraryRoot, initialized.workspace.id),
    readKnowledgeNotes(initialized.libraryRoot, initialized.workspace.id),
  ]);
  assert.equal(entries.length, 1);
  assert.equal(notes.length, 1);
  assert.equal(entries[0].id, result.worklogEntry.id);
  assert.equal(notes[0].id, result.knowledgeNote.id);

  const month = await readFile(
    join(initialized.libraryRoot, "workspaces", "northstar-systems", "worklog", "2026", "2026-08.md"),
    "utf8",
  );
  const note = await readFile(
    join(initialized.libraryRoot, "workspaces", "northstar-systems", "knowledge", `${result.knowledgeNote.id}.md`),
    "utf8",
  );
  assert.match(month, /## 2026-08-26 — we finished the migration/u);
  assert.match(note, /# Use VPN for staging migrations/u);
  assert.match(note, /Staging migrations require VPN access\./u);
});
