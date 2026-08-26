import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  captureMemory,
  initializeWorkLibrary,
  listActiveWorkspaces,
  readKnowledgeNotes,
  readWorklogEntries,
  setWorkspaceArchived,
} from "../../dist/index.js";
import { resolveAuthorizedLibraryPath } from "../../dist/library/paths.js";

const worker = new URL("./helpers/library-worker.mjs", import.meta.url);

async function setup(name) {
  const directory = await mkdtemp(join(tmpdir(), `progressbrief-${name}-`));
  return initializeWorkLibrary({
    libraryDirectory: join(directory, "library"),
    workspaceName: "Employer",
    workspaceKind: "employer",
    projectName: "Project",
    now: "2026-08-26T16:00:00Z",
  });
}

function runWorker(arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker.pathname, ...arguments_], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

test("personal defaults stay private; archived Workspaces are excluded and reject Capture", async () => {
  const first = await setup("archived");
  const personal = await initializeWorkLibrary({
    libraryDirectory: first.libraryRoot,
    workspaceName: "Personal",
    workspaceKind: "personal",
    projectName: "Portfolio",
    now: "2026-08-26T16:01:00Z",
  });
  assert.equal(personal.workspace.defaultVisibility, "private");
  await setWorkspaceArchived(first.libraryRoot, first.workspace.id, true, "2026-08-26T16:02:00Z");

  assert.deepEqual(
    (await listActiveWorkspaces(first.libraryRoot)).map(({ name }) => name),
    ["Personal"],
  );
  await assert.rejects(
    captureMemory({
      libraryDirectory: first.libraryRoot,
      workspace: first.workspace.id,
      text: "Capture: this must not enter an archived Workspace.",
      occurredOn: "2026-08-26",
    }),
    /archived Workspace/u,
  );
  assert.equal((await readWorklogEntries(first.libraryRoot, first.workspace.id, { includeArchived: true })).length, 0);
});

test("path authorization rejects traversal and an existing symlink escape", async () => {
  const initialized = await setup("paths");
  const outside = await mkdtemp(join(tmpdir(), "progressbrief-outside-"));
  await writeFile(join(outside, "secret.md"), "outside", "utf8");
  const link = join(initialized.libraryRoot, "workspaces", "employer", "knowledge", "escape");
  await symlink(outside, link);

  await assert.rejects(
    resolveAuthorizedLibraryPath(initialized.libraryRoot, "../outside.md"),
    /outside the configured Work Library/u,
  );
  await assert.rejects(
    resolveAuthorizedLibraryPath(initialized.libraryRoot, "workspaces/employer/knowledge/escape/secret.md"),
    /symlink escape/u,
  );
});

test("knowledge resolution cannot target another Workspace and lookup stays isolated", async () => {
  const first = await setup("isolation");
  const second = await initializeWorkLibrary({
    libraryDirectory: first.libraryRoot,
    workspaceName: "Personal",
    workspaceKind: "personal",
    projectName: "Project",
    now: "2026-08-26T16:01:00Z",
  });
  const privateNote = await captureMemory({
    libraryDirectory: second.libraryRoot,
    workspace: second.workspace.id,
    text: "Remember: keep portfolio drafts local.",
    knowledge: { title: "Keep portfolio drafts local", topics: ["portfolio"] },
    now: "2026-08-26T16:02:00Z",
  });

  await assert.rejects(
    captureMemory({
      libraryDirectory: first.libraryRoot,
      workspace: first.workspace.id,
      text: "Remember: keep employer drafts local.",
      knowledge: {
        title: "Keep employer drafts local",
        topics: ["drafts"],
        resolution: { action: "enrich", targetId: privateNote.knowledgeNote.id },
      },
      now: "2026-08-26T16:03:00Z",
    }),
    /outside the active Workspace/u,
  );
  assert.equal((await readKnowledgeNotes(first.libraryRoot, first.workspace.id)).length, 0);
  assert.equal((await readKnowledgeNotes(second.libraryRoot, second.workspace.id)).length, 1);
});

test("a bounded cross-process lock returns an actionable retry instead of corrupting data", async () => {
  const initialized = await setup("lock");
  const signal = join(initialized.libraryRoot, "lock-acquired.signal");
  const holder = runWorker(["hold-lock", initialized.libraryRoot, signal, "350"]);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await readFile(signal, "utf8");
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  const contender = await runWorker(["try-lock", initialized.libraryRoot, "40"]);
  assert.equal(contender.code, 2);
  assert.match(contender.stderr, /Work Library is busy; retry the operation/u);
  assert.equal((await holder).code, 0);
});

test("concurrent processes serialize monthly Worklog updates without losing either entry", async () => {
  const initialized = await setup("concurrent");
  const outcomes = await Promise.all([
    runWorker(["capture", initialized.libraryRoot, initialized.workspace.id, "first concurrent outcome"]),
    runWorker(["capture", initialized.libraryRoot, initialized.workspace.id, "second concurrent outcome"]),
  ]);
  assert.deepEqual(outcomes.map(({ code }) => code), [0, 0]);
  const entries = await readWorklogEntries(initialized.libraryRoot, initialized.workspace.id);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map(({ summary }) => summary).sort(), [
    "first concurrent outcome",
    "second concurrent outcome",
  ]);
});

test("the next operation recovers a prepared mutation after a killed writer actually truncates a file", async () => {
  const initialized = await setup("interrupted");
  await captureMemory({
    libraryDirectory: initialized.libraryRoot,
    workspace: initialized.workspace.id,
    text: "Capture: original durable outcome.",
    occurredOn: "2026-08-26",
    now: "2026-08-26T16:05:00Z",
  });
  const monthPath = join(initialized.libraryRoot, "workspaces", "employer", "worklog", "2026", "2026-08.md");
  const before = await readFile(monthPath, "utf8");
  const interrupted = await runWorker(["interrupt", initialized.libraryRoot, initialized.workspace.id, monthPath]);
  assert.equal(interrupted.code, 86);
  assert.equal((await readFile(monthPath, "utf8")).length, 7, "worker must really truncate the target");

  await captureMemory({
    libraryDirectory: initialized.libraryRoot,
    workspace: initialized.workspace.id,
    text: "Capture: outcome after recovery.",
    occurredOn: "2026-08-26",
    now: "2026-08-26T16:06:00Z",
  });
  const after = await readFile(monthPath, "utf8");
  assert.match(after, /original durable outcome/u);
  assert.match(after, /outcome after recovery/u);
  assert.ok(after.length > before.length);
  assert.equal((await readWorklogEntries(initialized.libraryRoot, initialized.workspace.id)).length, 2);
  assert.equal(dirname(monthPath).startsWith(initialized.libraryRoot), true);
});
