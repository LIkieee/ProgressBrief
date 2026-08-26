import { mkdir, mkdtemp, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  captureMemory,
  createStableId,
  initializeWorkLibrary,
  setWorkspaceArchived,
} from "../../../dist/index.js";
import {
  serializeKnowledgeNote,
  serializeWorkspace,
} from "../../../dist/library/markdown.js";

export async function setupRecallFixture(name) {
  const directory = await mkdtemp(join(tmpdir(), `progressbrief-recall-${name}-`));
  const initialized = await initializeWorkLibrary({
    libraryDirectory: join(directory, "library"),
    workspaceName: "Northstar Systems",
    workspaceKind: "employer",
    projectName: "Reconciliation pipeline",
    now: "2026-08-01T12:00:00Z",
  });
  const reconciliation = initialized.workspace.projects[0];
  const delivery = {
    id: createStableId("project"),
    slug: "enterprise-delivery",
    name: "Enterprise delivery",
    repositoryAssociations: [],
  };
  const expandedWorkspace = {
    ...initialized.workspace,
    projects: [...initialized.workspace.projects, delivery],
    updatedAt: "2026-08-02T12:00:00Z",
  };
  await writeFile(
    join(initialized.libraryRoot, "workspaces", initialized.workspace.slug, "workspace.md"),
    serializeWorkspace(expandedWorkspace),
    "utf8",
  );

  const replay = await captureMemory({
    libraryDirectory: initialized.libraryRoot,
    workspace: expandedWorkspace.id,
    text: "Remember: staging load tests must use replay-safe mode.",
    now: "2026-08-20T12:00:00Z",
    projectIds: [reconciliation.id],
    sourceIds: ["src_30000000-0000-4000-8000-000000000001"],
    knowledge: {
      title: "Use replay-safe mode for staging load tests",
      topics: ["load-testing", "reconciliation", "staging"],
      body: "Enable replay-safe mode because the callback fixture may deliver the same callback twice.",
      examples: ["Run the synthetic replay harness before comparing durations."],
      caveats: ["This applies to staging only."],
    },
  });
  const replayDirectory = join(
    initialized.libraryRoot,
    "workspaces",
    expandedWorkspace.slug,
    "knowledge",
    "runbooks",
  );
  await mkdir(replayDirectory, { recursive: true });
  await rename(
    join(
      initialized.libraryRoot,
      "workspaces",
      expandedWorkspace.slug,
      "knowledge",
      `${replay.knowledgeNote.id}.md`,
    ),
    join(replayDirectory, "callback-playbook.md"),
  );

  const oldWorkerLimit = await captureMemory({
    libraryDirectory: initialized.libraryRoot,
    workspace: expandedWorkspace.id,
    text: "Remember: use eight reconciliation workers.",
    now: "2026-08-10T12:00:00Z",
    projectIds: [reconciliation.id],
    sourceIds: ["src_30000000-0000-4000-8000-000000000002"],
    knowledge: {
      title: "Use eight reconciliation workers",
      topics: ["reconciliation", "workers"],
      body: "The earlier synthetic runbook allowed eight concurrent reconciliation workers.",
    },
  });
  const currentWorkerLimit = await captureMemory({
    libraryDirectory: initialized.libraryRoot,
    workspace: expandedWorkspace.id,
    text: "Remember: use no more than four reconciliation workers.",
    now: "2026-08-23T12:00:00Z",
    projectIds: [reconciliation.id],
    sourceIds: ["src_30000000-0000-4000-8000-000000000003"],
    knowledge: {
      title: "Limit reconciliation to four workers",
      topics: ["reconciliation", "workers"],
      body: "Use no more than four concurrent reconciliation workers under the current synthetic vendor limit.",
      caveats: ["Reconfirm the ceiling if the vendor limit changes again."],
      resolution: { action: "supersede", targetId: oldWorkerLimit.knowledgeNote.id },
    },
  });

  const shareable = await captureMemory({
    libraryDirectory: initialized.libraryRoot,
    workspace: expandedWorkspace.id,
    text: "Remember: the rollout checklist is safe to share.",
    now: "2026-08-24T12:00:00Z",
    projectIds: [delivery.id],
    sourceIds: ["src_30000000-0000-4000-8000-000000000004"],
    knowledge: {
      title: "Shareable rollout checklist",
      topics: ["rollout", "checklist"],
      body: "Use the synthetic rollout checklist for the cohort handoff.",
    },
  });
  const shareableNote = { ...shareable.knowledgeNote, visibility: "shareable" };
  await writeFile(
    join(
      initialized.libraryRoot,
      "workspaces",
      expandedWorkspace.slug,
      "knowledge",
      `${shareableNote.id}.md`,
    ),
    serializeKnowledgeNote(shareableNote),
    "utf8",
  );

  const rollout = await captureMemory({
    libraryDirectory: initialized.libraryRoot,
    workspace: expandedWorkspace.id,
    text: "Capture: launched the synthetic rollout cohort.",
    occurredOn: "2026-07-15",
    now: "2026-07-15T16:00:00Z",
    projectIds: [delivery.id],
    sourceIds: ["src_30000000-0000-4000-8000-000000000005"],
  });

  const personal = await initializeWorkLibrary({
    libraryDirectory: initialized.libraryRoot,
    workspaceName: "Personal",
    workspaceKind: "personal",
    projectName: "Portfolio",
    now: "2026-08-03T12:00:00Z",
  });
  const personalNote = await captureMemory({
    libraryDirectory: initialized.libraryRoot,
    workspace: personal.workspace.id,
    text: "Remember: keep the portfolio interview outline private.",
    now: "2026-08-25T12:00:00Z",
    sourceIds: ["src_30000000-0000-4000-8000-000000000006"],
    knowledge: {
      title: "Private portfolio interview outline",
      topics: ["portfolio", "interview"],
      body: "Keep the portfolio interview outline in the personal Workspace.",
    },
  });

  const archived = await initializeWorkLibrary({
    libraryDirectory: initialized.libraryRoot,
    workspaceName: "Archived Client",
    workspaceKind: "employer",
    projectName: "Legacy migration",
    now: "2026-07-01T12:00:00Z",
  });
  const archivedNote = await captureMemory({
    libraryDirectory: initialized.libraryRoot,
    workspace: archived.workspace.id,
    text: "Remember: the legacy deployment used the amber tunnel.",
    now: "2026-07-02T12:00:00Z",
    sourceIds: ["src_30000000-0000-4000-8000-000000000007"],
    knowledge: {
      title: "Legacy deployment tunnel",
      topics: ["deployment", "legacy"],
      body: "The archived synthetic project used the amber tunnel for deployment.",
    },
  });
  await setWorkspaceArchived(
    initialized.libraryRoot,
    archived.workspace.id,
    true,
    "2026-08-26T12:00:00Z",
  );

  return {
    libraryRoot: initialized.libraryRoot,
    workspaces: {
      northstar: expandedWorkspace,
      personal: personal.workspace,
      archived: { ...archived.workspace, archived: true },
    },
    projects: { reconciliation, delivery },
    records: {
      replay: replay.knowledgeNote,
      oldWorkerLimit: oldWorkerLimit.knowledgeNote,
      currentWorkerLimit: currentWorkerLimit.knowledgeNote,
      shareable: shareableNote,
      rollout: rollout.worklogEntry,
      personal: personalNote.knowledgeNote,
      archived: archivedNote.knowledgeNote,
    },
  };
}
