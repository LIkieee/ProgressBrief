import { readdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

import { createStableId, isStableId } from "../contracts/ids.js";
import {
  parseKnowledgeNote,
  parseWorklogMonth,
  serializeKnowledgeNote,
  serializeWorklogMonth,
} from "./markdown.js";
import { resolveAuthorizedLibraryPath } from "./paths.js";
import {
  applyLibraryMutationUnlocked,
  withRecoveredLibraryLock,
} from "./persistence.js";
import type {
  CaptureClassification,
  CaptureMemoryOptions,
  CaptureMemoryResult,
  KnowledgeCaptureInput,
  KnowledgeNote,
  KnowledgeRelationship,
  KnowledgeWriteAction,
  WorklogEntry,
  WorkspaceDocument,
} from "./types.js";
import { ensureLibraryInitialized, loadWorkspace } from "./workspace.js";

const EVENT_LANGUAGE = /\b(?:finished|completed|shipped|launched|merged|decided|blocked|planned|drafted|reduced|increased|fixed|migrated|delivered|resolved|outcome)\b/iu;
const DURABLE_LANGUAGE = /\b(?:require|requires|required|must|always|never|use|enable|disable|before|after|caveat|shortcut|tip|lesson)\b/iu;
const CAPTURE_PREFIX = /^capture(?:\s+this\s+for\s+my\s+(?:weekly|biweekly|monthly|quarterly)\s+update)?\s*:\s*/iu;
const REMEMBER_PREFIX = /^remember\s*:\s*/iu;

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function cleanText(value: string): string {
  const cleaned = value.trim();
  if (cleaned.length === 0) throw new Error("Capture or Remember requires content.");
  return cleaned;
}

export function classifyMemoryRequest(request: string): CaptureClassification {
  const raw = cleanText(request);
  const remember = REMEMBER_PREFIX.test(raw);
  const capture = CAPTURE_PREFIX.test(raw);
  const text = cleanText(raw.replace(remember ? REMEMBER_PREFIX : CAPTURE_PREFIX, ""));
  const event = EVENT_LANGUAGE.test(text);
  const durable = DURABLE_LANGUAGE.test(text);
  let destinations: CaptureClassification["destinations"];

  if ((event && durable) || (remember && event)) {
    destinations = ["worklog", "knowledge"];
  } else if (remember || durable) {
    destinations = ["knowledge"];
  } else if (capture || event) {
    destinations = ["worklog"];
  } else {
    destinations = ["worklog"];
  }
  return { destinations, text };
}

function inferCategory(text: string): WorklogEntry["category"] {
  if (/\b(?:blocker|blocked|waiting|dependency)\b/iu.test(text)) return "blocker";
  if (/\b(?:decided|decision|chose)\b/iu.test(text)) return "decision";
  if (/\b(?:plan|planned|next|will)\b/iu.test(text)) return "plan";
  if (/\b(?:paired|collaborated|reviewed with)\b/iu.test(text)) return "collaboration";
  if (EVENT_LANGUAGE.test(text)) return "outcome";
  return "activity";
}

function summaryFromText(text: string): string {
  const summary = text.replace(/[.!?]+$/u, "").trim();
  return summary.slice(0, 300);
}

function defaultKnowledgeTitle(text: string): string {
  const sentence = text.split(/[.!?](?:\s|$)/u)[0]?.trim() ?? text;
  return sentence.slice(0, 160);
}

function assertProjectIds(workspace: WorkspaceDocument, projectIds: readonly string[]): void {
  const allowed = new Set(workspace.projects.map(({ id }) => id));
  for (const projectId of projectIds) {
    if (!allowed.has(projectId)) {
      throw new Error(`Project ${projectId} is outside the active Workspace.`);
    }
  }
}

function assertSourceIds(sourceIds: readonly string[]): void {
  for (const sourceId of sourceIds) {
    if (!isStableId("source", sourceId)) throw new Error("Invalid Capture source ID.");
  }
}

async function markdownFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await markdownFiles(path));
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
    }
    return files.sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readKnowledgeNotesForWorkspace(
  libraryRoot: string,
  workspace: WorkspaceDocument,
): Promise<KnowledgeNote[]> {
  const directory = await resolveAuthorizedLibraryPath(
    libraryRoot,
    `workspaces/${workspace.slug}/knowledge`,
  );
  const files = await markdownFiles(directory);
  const notes = await Promise.all(files.map(async (path) => parseKnowledgeNote(await readFile(path, "utf8"))));
  for (const note of notes) {
    if (note.workspaceId !== workspace.id) {
      throw new Error(`Knowledge Note ${note.id} crosses a Workspace boundary.`);
    }
  }
  return notes.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function readKnowledgeNotes(
  libraryRoot: string,
  workspaceReference: string,
  options: { includeArchived?: boolean } = {},
): Promise<KnowledgeNote[]> {
  const workspace = await loadWorkspace(libraryRoot, workspaceReference, options);
  return readKnowledgeNotesForWorkspace(libraryRoot, workspace);
}

async function readWorklogEntriesForWorkspace(
  libraryRoot: string,
  workspace: WorkspaceDocument,
): Promise<WorklogEntry[]> {
  const directory = await resolveAuthorizedLibraryPath(
    libraryRoot,
    `workspaces/${workspace.slug}/worklog`,
  );
  const files = await markdownFiles(directory);
  const entries = (await Promise.all(
    files.map(async (path) => parseWorklogMonth(await readFile(path, "utf8"))),
  )).flat();
  for (const entry of entries) {
    if (entry.workspaceId !== workspace.id) {
      throw new Error(`Worklog Entry ${entry.id} crosses a Workspace boundary.`);
    }
  }
  return entries.sort((left, right) => {
    const byDate = left.occurredOn.localeCompare(right.occurredOn);
    return byDate === 0 ? left.createdAt.localeCompare(right.createdAt) : byDate;
  });
}

export async function readWorklogEntries(
  libraryRoot: string,
  workspaceReference: string,
  options: { includeArchived?: boolean } = {},
): Promise<WorklogEntry[]> {
  const workspace = await loadWorkspace(libraryRoot, workspaceReference, options);
  return readWorklogEntriesForWorkspace(libraryRoot, workspace);
}

function notePath(libraryRoot: string, workspace: WorkspaceDocument, noteId: string): string {
  return join(libraryRoot, "workspaces", workspace.slug, "knowledge", `${noteId}.md`);
}

function addRelationship(
  relationships: readonly KnowledgeRelationship[],
  relationship: KnowledgeRelationship,
): KnowledgeRelationship[] {
  if (relationships.some(({ type, targetId }) => type === relationship.type && targetId === relationship.targetId)) {
    return [...relationships];
  }
  return [...relationships, relationship];
}

interface KnowledgePlan {
  note: KnowledgeNote;
  action: KnowledgeWriteAction;
  changedNotes: Array<{ before: KnowledgeNote | null; after: KnowledgeNote }>;
}

function createKnowledgeNote(
  workspace: WorkspaceDocument,
  projectIds: string[],
  sourceIds: string[],
  text: string,
  input: KnowledgeCaptureInput,
  now: string,
  relationships: KnowledgeRelationship[] = [],
): KnowledgeNote {
  return {
    schemaVersion: "1.0.0",
    id: createStableId("knowledgeNote"),
    workspaceId: workspace.id,
    title: (input.title ?? defaultKnowledgeTitle(text)).trim(),
    visibility: workspace.defaultVisibility,
    status: "current",
    projectIds,
    topics: unique(input.topics ?? ["captured-knowledge"]),
    body: (input.body ?? text).trim(),
    examples: unique(input.examples ?? []),
    caveats: unique(input.caveats ?? []),
    sourceIds,
    relationships,
    createdAt: now,
    updatedAt: now,
  };
}

function planKnowledgeWrite(
  workspace: WorkspaceDocument,
  notes: readonly KnowledgeNote[],
  projectIds: string[],
  captureSourceIds: string[],
  text: string,
  input: KnowledgeCaptureInput,
  now: string,
): KnowledgePlan {
  const sourceIds = input.sourceIds ?? captureSourceIds;
  assertSourceIds(sourceIds);
  const resolution = input.resolution;
  const target = resolution === undefined
    ? undefined
    : notes.find(({ id }) => id === resolution.targetId);
  if (resolution !== undefined && target === undefined) {
    throw new Error(`Knowledge target ${resolution.targetId} is outside the active Workspace or does not exist.`);
  }

  if (resolution?.action === "enrich" && target !== undefined) {
    const enriched: KnowledgeNote = {
      ...target,
      projectIds: unique([...target.projectIds, ...projectIds]),
      topics: unique([...target.topics, ...(input.topics ?? [])]),
      examples: unique([...target.examples, ...(input.examples ?? [])]),
      caveats: unique([...target.caveats, ...(input.caveats ?? [])]),
      sourceIds: unique([...target.sourceIds, ...sourceIds]),
      updatedAt: now,
    };
    return { note: enriched, action: "enriched", changedNotes: [{ before: target, after: enriched }] };
  }

  if (resolution?.action === "related" && target !== undefined) {
    const created = createKnowledgeNote(
      workspace,
      projectIds,
      sourceIds,
      text,
      input,
      now,
      [{ type: "related", targetId: target.id }],
    );
    const linkedTarget: KnowledgeNote = {
      ...target,
      relationships: addRelationship(target.relationships, { type: "related", targetId: created.id }),
      updatedAt: now,
    };
    return {
      note: created,
      action: "related-created",
      changedNotes: [{ before: target, after: linkedTarget }, { before: null, after: created }],
    };
  }

  if (resolution?.action === "supersede" && target !== undefined) {
    const created = createKnowledgeNote(
      workspace,
      projectIds,
      sourceIds,
      text,
      input,
      now,
      [{ type: "supersedes", targetId: target.id }],
    );
    const superseded: KnowledgeNote = { ...target, status: "superseded", updatedAt: now };
    return {
      note: created,
      action: "superseded",
      changedNotes: [{ before: target, after: superseded }, { before: null, after: created }],
    };
  }

  const candidateTitle = (input.title ?? defaultKnowledgeTitle(text)).trim();
  const candidateBody = (input.body ?? text).trim();
  const exact = notes.find(
    ({ title, body, status }) => status === "current"
      && normalized(title) === normalized(candidateTitle)
      && normalized(body) === normalized(candidateBody),
  );
  if (exact !== undefined) {
    const addedExamples = (input.examples ?? []).filter((value) => !exact.examples.includes(value));
    const addedCaveats = (input.caveats ?? []).filter((value) => !exact.caveats.includes(value));
    const addedSources = (input.sourceIds ?? []).filter((value) => !exact.sourceIds.includes(value));
    if (addedExamples.length === 0 && addedCaveats.length === 0 && addedSources.length === 0) {
      return { note: exact, action: "duplicate-skipped", changedNotes: [] };
    }
    const enriched: KnowledgeNote = {
      ...exact,
      examples: unique([...exact.examples, ...addedExamples]),
      caveats: unique([...exact.caveats, ...addedCaveats]),
      sourceIds: unique([...exact.sourceIds, ...addedSources]),
      updatedAt: now,
    };
    return { note: enriched, action: "enriched", changedNotes: [{ before: exact, after: enriched }] };
  }

  const created = createKnowledgeNote(workspace, projectIds, sourceIds, text, input, now);
  return { note: created, action: "created", changedNotes: [{ before: null, after: created }] };
}

export async function captureMemory(options: CaptureMemoryOptions): Promise<CaptureMemoryResult> {
  await ensureLibraryInitialized(options.libraryDirectory);
  const libraryRoot = await realpath(options.libraryDirectory);
  const classification = classifyMemoryRequest(options.text);
  const now = options.now ?? new Date().toISOString();
  const occurredOn = options.occurredOn ?? now.slice(0, 10);

  return withRecoveredLibraryLock(libraryRoot, async () => {
    const workspace = await loadWorkspace(libraryRoot, options.workspace);
    const projectIds = unique(options.projectIds ?? [workspace.projects[0]?.id ?? ""]);
    if (projectIds.length === 0 || projectIds[0] === "") {
      throw new Error(`Workspace ${workspace.name} has no project for Capture.`);
    }
    assertProjectIds(workspace, projectIds);
    const captureSourceIds = unique(options.sourceIds ?? [createStableId("source")]);
    assertSourceIds(captureSourceIds);
    const changes = [];
    let knowledgePlan: KnowledgePlan | undefined;

    if (classification.destinations.includes("knowledge")) {
      const notes = await readKnowledgeNotesForWorkspace(libraryRoot, workspace);
      knowledgePlan = planKnowledgeWrite(
        workspace,
        notes,
        projectIds,
        captureSourceIds,
        classification.text,
        options.knowledge ?? {},
        now,
      );
      for (const changed of knowledgePlan.changedNotes) {
        const path = notePath(libraryRoot, workspace, changed.after.id);
        changes.push({
          path,
          before: changed.before === null ? null : serializeKnowledgeNote(changed.before),
          after: serializeKnowledgeNote(changed.after),
        });
      }
    }

    let worklogEntry: WorklogEntry | undefined;
    if (classification.destinations.includes("worklog")) {
      const yearMonth = occurredOn.slice(0, 7);
      if (!/^\d{4}-\d{2}$/u.test(yearMonth)) throw new Error(`Invalid Worklog date: ${occurredOn}.`);
      const path = join(
        libraryRoot,
        "workspaces",
        workspace.slug,
        "worklog",
        occurredOn.slice(0, 4),
        `${yearMonth}.md`,
      );
      let before: string | null;
      try {
        before = await readFile(path, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        before = null;
      }
      const existing = before === null ? [] : parseWorklogMonth(before);
      worklogEntry = {
        schemaVersion: "1.0.0",
        id: createStableId("worklogEntry"),
        workspaceId: workspace.id,
        occurredOn,
        createdAt: now,
        updatedAt: now,
        projectIds,
        visibility: workspace.defaultVisibility,
        category: options.category ?? inferCategory(classification.text),
        summary: summaryFromText(classification.text),
        details: classification.text,
        sourceIds: captureSourceIds,
        relatedKnowledgeIds: knowledgePlan === undefined ? [] : [knowledgePlan.note.id],
      };
      changes.push({
        path,
        before,
        after: serializeWorklogMonth(yearMonth, [...existing, worklogEntry]),
      });
    }

    if (changes.length > 0) {
      await applyLibraryMutationUnlocked(
        libraryRoot,
        workspace.id,
        `Capture to ${classification.destinations.join(" and ")}`,
        changes,
        { now },
      );
    }

    const labels = classification.destinations.map((destination) => destination === "worklog" ? "Worklog" : "Knowledge");
    const result: CaptureMemoryResult = {
      ...classification,
      acknowledgement: `Saved to ${workspace.name}: ${labels.join(" + ")}.`,
    };
    if (worklogEntry !== undefined) result.worklogEntry = worklogEntry;
    if (knowledgePlan !== undefined) {
      result.knowledgeNote = knowledgePlan.note;
      result.knowledgeAction = knowledgePlan.action;
    }
    return result;
  });
}
