import { readdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import {
  captureMemory,
  createStableId,
  initializeWorkLibrary,
} from "../../../dist/index.js";
import {
  parseWorkspace,
  serializeWorkspace,
} from "../../../dist/library/markdown.js";

async function remember(initialized, input) {
  return captureMemory({
    libraryDirectory: initialized.libraryRoot,
    workspace: initialized.workspace.id,
    text: `Remember: ${input.body}`,
    now: input.now,
    projectIds: input.projectIds,
    sourceIds: input.sourceIds,
    knowledge: {
      title: input.title,
      body: input.body,
      topics: input.topics,
      examples: input.examples ?? [],
      caveats: input.caveats ?? [],
      ...(input.resolution === undefined ? {} : { resolution: input.resolution }),
    },
  });
}

export async function setupCurateLibrary(name) {
  const directory = await mkdtemp(join(tmpdir(), `progressbrief-curate-${name}-`));
  const initialized = await initializeWorkLibrary({
    libraryDirectory: join(directory, "library"),
    workspaceName: "Northstar Systems",
    workspaceKind: "employer",
    projectName: "Reconciliation",
    now: "2026-08-26T17:00:00Z",
  });

  const workspacePath = join(
    initialized.libraryRoot,
    "workspaces",
    initialized.workspace.slug,
    "workspace.md",
  );
  const workspace = parseWorkspace(await readFile(workspacePath, "utf8"));
  const secondProjectId = createStableId("project");
  workspace.projects.push({
    id: secondProjectId,
    slug: "release-readiness",
    name: "Release readiness",
    repositoryAssociations: [],
  });
  workspace.updatedAt = "2026-08-26T17:00:30Z";
  await writeFile(workspacePath, serializeWorkspace(workspace), "utf8");

  const firstProjectId = workspace.projects[0].id;
  const duplicateFirst = await remember(initialized, {
    title: "Guard replay callbacks",
    body: "Replay callbacks require idempotency keys.",
    topics: ["callbacks", "replay"],
    projectIds: [firstProjectId],
    now: "2026-08-26T17:01:00Z",
  });
  const duplicateSecond = await remember(initialized, {
    title: "Require idempotency for callbacks",
    body: "Replay callbacks require idempotency keys.",
    topics: ["idempotency", "replay"],
    projectIds: [firstProjectId],
    now: "2026-08-26T17:02:00Z",
  });

  const contradictionOld = await remember(initialized, {
    title: "Use 24 production replay workers",
    body: "Production replay workers use 24 concurrent jobs.",
    topics: ["worker-count"],
    projectIds: [firstProjectId],
    now: "2026-08-26T17:03:00Z",
  });
  const contradictionNew = await remember(initialized, {
    title: "Use 8 production replay workers",
    body: "Production replay workers now use 8 concurrent jobs instead of 24.",
    topics: ["worker-count"],
    projectIds: [firstProjectId],
    now: "2026-08-26T17:04:00Z",
  });

  const staleOriginal = await remember(initialized, {
    title: "Use legacy replay mode",
    body: "Staging replays require legacy mode.",
    topics: ["legacy-replay"],
    projectIds: [firstProjectId],
    now: "2026-08-26T17:05:00Z",
  });
  const staleSuccessor = await remember(initialized, {
    title: "Use guarded replay mode",
    body: "Staging replays now require guarded mode.",
    topics: ["guarded-replay"],
    projectIds: [firstProjectId],
    now: "2026-08-26T17:06:00Z",
    resolution: {
      action: "supersede",
      targetId: staleOriginal.knowledgeNote.id,
    },
  });

  const sharedSourceId = createStableId("source");
  const missingLinkFirst = await remember(initialized, {
    title: "Replay dashboard ownership",
    body: "The reliability team owns the replay dashboard.",
    topics: ["ownership"],
    projectIds: [firstProjectId],
    sourceIds: [sharedSourceId],
    now: "2026-08-26T17:07:00Z",
  });
  const missingLinkSecond = await remember(initialized, {
    title: "Replay dashboard alert route",
    body: "Dashboard alerts route to the operations channel.",
    topics: ["alerts"],
    projectIds: [firstProjectId],
    sourceIds: [sharedSourceId],
    now: "2026-08-26T17:08:00Z",
  });

  const broad = await remember(initialized, {
    title: "Everything about replay delivery",
    body: "Replay delivery guidance covers modes, ownership, alerts, rollback, and release readiness.",
    topics: ["modes", "ownership", "alerts", "rollback", "release-readiness"],
    projectIds: [firstProjectId],
    now: "2026-08-26T17:09:00Z",
  });

  return {
    directory,
    initialized,
    projectIds: { first: firstProjectId, second: secondProjectId },
    notes: {
      duplicateFirst: duplicateFirst.knowledgeNote,
      duplicateSecond: duplicateSecond.knowledgeNote,
      contradictionOld: contradictionOld.knowledgeNote,
      contradictionNew: contradictionNew.knowledgeNote,
      staleOriginal: staleOriginal.knowledgeNote,
      staleSuccessor: staleSuccessor.knowledgeNote,
      missingLinkFirst: missingLinkFirst.knowledgeNote,
      missingLinkSecond: missingLinkSecond.knowledgeNote,
      broad: broad.knowledgeNote,
    },
  };
}

async function filesBelow(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(root, path));
    if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

export async function snapshotLibrary(libraryRoot) {
  const entries = await Promise.all((await filesBelow(libraryRoot)).map(async (path) => [
    relative(libraryRoot, path).split("\\").join("/"),
    (await readFile(path)).toString("base64"),
  ]));
  return Object.fromEntries(entries);
}

export function proposalInput(seed, discovery) {
  const selectedKinds = new Set(["duplicate", "contradiction", "missing-link", "broad-note"]);
  const candidateIds = discovery.candidates
    .filter(({ kind }) => selectedKinds.has(kind))
    .map(({ id }) => id);
  return {
    summary: "Consolidate duplicate guidance and repair replay-note organization.",
    candidateIds,
    operations: [
      {
        kind: "merge",
        canonicalId: seed.notes.duplicateFirst.id,
        duplicateIds: [seed.notes.duplicateSecond.id],
      },
      {
        kind: "supersession",
        successorId: seed.notes.contradictionNew.id,
        supersededId: seed.notes.contradictionOld.id,
      },
      {
        kind: "relation",
        leftId: seed.notes.missingLinkFirst.id,
        rightId: seed.notes.missingLinkSecond.id,
      },
      {
        kind: "rewrite",
        noteId: seed.notes.broad.id,
        title: "Replay readiness guide",
        body: "Keep replay mode, ownership, and rollback guidance in one focused note.",
        topics: ["replay-readiness", "rollback"],
      },
      {
        kind: "move",
        noteId: seed.notes.broad.id,
        projectIds: [seed.projectIds.second],
      },
    ],
  };
}
