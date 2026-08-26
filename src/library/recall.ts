import { readdir, readFile, realpath } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { parseKnowledgeNote, parseWorklogMonth } from "./markdown.js";
import { resolveAuthorizedLibraryPath } from "./paths.js";
import type {
  KnowledgeNote,
  Visibility,
  WorkspaceDocument,
} from "./types.js";
import {
  ensureLibraryInitialized,
  listActiveWorkspaces,
  loadWorkspace,
} from "./workspace.js";

export type RecallMatchedField = "path" | "metadata" | "heading" | "body";

export interface RecallWorkspaceChoice {
  id: string;
  slug: string;
  name: string;
}

export interface RecallCandidate {
  id: string;
  kind: "knowledge" | "worklog";
  workspaceId: string;
  workspaceName: string;
  title: string;
  excerpt: string;
  visibility: Visibility;
  projectIds: string[];
  topics: string[];
  sourceIds: string[];
  recordDate: string;
  status: "current" | "superseded";
  noteLink: string;
  score: number;
  matchedTerms: string[];
  matchedFields: RecallMatchedField[];
  supersededIds: string[];
}

export interface RecallSearchOptions {
  libraryDirectory: string;
  query: string;
  workspace?: string | readonly string[];
  includeArchived?: boolean;
  project?: readonly string[];
  dateFrom?: string;
  dateTo?: string;
  topic?: readonly string[];
  visibility?: readonly Visibility[];
  maxCandidates?: number;
}

export interface RecallOptions extends RecallSearchOptions {
  rerankedIds?: readonly string[];
}

export interface RecallSearchResult {
  status: "ready" | "needs-workspace";
  query: string;
  queryTerms: string[];
  expandedTerms: string[];
  workspaceChoices: RecallWorkspaceChoice[];
  candidates: RecallCandidate[];
}

export interface RecallResult {
  status: "found" | "no-results" | "needs-workspace";
  answer: string;
  query: string;
  queryTerms: string[];
  expandedTerms: string[];
  workspaceChoices: RecallWorkspaceChoice[];
  candidates: RecallCandidate[];
}

interface IndexedRecord {
  candidate: Omit<RecallCandidate, "score" | "matchedTerms" | "matchedFields" | "supersededIds">;
  fields: Record<RecallMatchedField, string>;
  relationships: KnowledgeNote["relationships"];
}

interface ScoredRecord {
  indexed: IndexedRecord;
  score: number;
  matchedTerms: string[];
  matchedFields: RecallMatchedField[];
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "before",
  "did",
  "do",
  "does",
  "during",
  "for",
  "how",
  "i",
  "in",
  "is",
  "it",
  "my",
  "of",
  "should",
  "the",
  "this",
  "to",
  "was",
  "what",
  "which",
  "with",
]);

const QUERY_EXPANSIONS: Readonly<Record<string, readonly string[]>> = {
  avoid: ["safe", "guard", "prevent"],
  callback: ["replay", "webhook"],
  current: ["latest", "now"],
  duplicate: ["replay", "repeated", "twice"],
  guidance: ["must", "require", "use"],
  limit: ["cap", "ceiling", "maximum"],
  prevent: ["avoid", "guard", "replay", "safe"],
  repeated: ["duplicate", "replay", "twice"],
  retry: ["replay", "repeat"],
  stress: ["load", "performance"],
};

const FIELD_WEIGHTS: Readonly<Record<RecallMatchedField, number>> = {
  path: 7,
  metadata: 4,
  heading: 8,
  body: 3,
};

function canonicalToken(value: string): string {
  if (value.length > 4 && value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.length > 3 && value.endsWith("s") && !value.endsWith("ss")) return value.slice(0, -1);
  return value;
}

function tokens(value: string): string[] {
  return [...new Set(
    value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[\u0300-\u036f]/gu, "")
      .match(/[a-z0-9]+/gu)
      ?.map(canonicalToken)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)) ?? [],
  )];
}

function queryExpansion(queryTerms: readonly string[]): string[] {
  const expanded = new Set<string>();
  for (const term of queryTerms) {
    for (const related of QUERY_EXPANSIONS[term] ?? []) {
      const canonical = canonicalToken(related);
      if (!queryTerms.includes(canonical)) expanded.add(canonical);
    }
  }
  return [...expanded].sort();
}

function toPortablePath(path: string): string {
  return path.split(sep).join("/");
}

function noteHref(relativePath: string): string {
  return toPortablePath(relativePath)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function excerpt(value: string): string {
  const cleaned = oneLine(value);
  if (cleaned.length <= 280) return cleaned;
  return `${cleaned.slice(0, 277).trimEnd()}…`;
}

function markdownText(value: string): string {
  return oneLine(value).replace(/([\\`*_[\]<>])/gu, "\\$1");
}

function workspaceChoice(workspace: WorkspaceDocument): RecallWorkspaceChoice {
  return { id: workspace.id, slug: workspace.slug, name: workspace.name };
}

function validateDate(value: string | undefined, label: string): void {
  if (value === undefined) return;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`${label} must be a YYYY-MM-DD date.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid calendar date.`);
  }
}

function validateOptions(options: RecallSearchOptions): void {
  if (options.query.trim().length === 0) throw new Error("Recall requires a question.");
  validateDate(options.dateFrom, "Recall dateFrom");
  validateDate(options.dateTo, "Recall dateTo");
  if (options.dateFrom !== undefined && options.dateTo !== undefined && options.dateFrom > options.dateTo) {
    throw new Error("Recall dateFrom must not be after dateTo.");
  }
  if (options.visibility?.some((value) => !["private", "internal", "shareable"].includes(value))) {
    throw new Error("Recall visibility must be private, internal, or shareable.");
  }
  if (options.maxCandidates !== undefined && (!Number.isInteger(options.maxCandidates) || options.maxCandidates < 1 || options.maxCandidates > 50)) {
    throw new Error("Recall maxCandidates must be an integer from 1 through 50.");
  }
}

async function selectedWorkspaces(
  libraryRoot: string,
  selection: RecallSearchOptions["workspace"],
  includeArchived: boolean,
): Promise<{ workspaces: WorkspaceDocument[]; choices: RecallWorkspaceChoice[]; ambiguous: boolean }> {
  if (selection === undefined) {
    const active = await listActiveWorkspaces(libraryRoot);
    if (active.length === 1) {
      return { workspaces: active, choices: active.map(workspaceChoice), ambiguous: false };
    }
    return { workspaces: [], choices: active.map(workspaceChoice), ambiguous: true };
  }

  const references = typeof selection === "string" ? [selection] : [...selection];
  if (references.length === 0) throw new Error("Recall Workspace selection cannot be empty.");
  const workspaces: WorkspaceDocument[] = [];
  for (const reference of [...new Set(references)]) {
    const workspace = await loadWorkspace(libraryRoot, reference, { includeArchived });
    if (!workspaces.some(({ id }) => id === workspace.id)) workspaces.push(workspace);
  }
  return { workspaces, choices: workspaces.map(workspaceChoice), ambiguous: false };
}

async function markdownFiles(libraryRoot: string, directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(libraryRoot, path));
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(await resolveAuthorizedLibraryPath(libraryRoot, path));
    }
  }
  return files.sort();
}

function projectMetadata(workspace: WorkspaceDocument, projectIds: readonly string[]): string {
  return workspace.projects
    .filter(({ id }) => projectIds.includes(id))
    .flatMap(({ id, slug, name }) => [id, slug, name])
    .join(" ");
}

async function indexWorkspace(
  libraryRoot: string,
  workspace: WorkspaceDocument,
): Promise<IndexedRecord[]> {
  const workspaceRoot = await resolveAuthorizedLibraryPath(
    libraryRoot,
    `workspaces/${workspace.slug}`,
  );
  const [knowledgeFiles, worklogFiles] = await Promise.all([
    markdownFiles(libraryRoot, join(workspaceRoot, "knowledge")),
    markdownFiles(libraryRoot, join(workspaceRoot, "worklog")),
  ]);
  const records: IndexedRecord[] = [];

  for (const path of knowledgeFiles) {
    const note = parseKnowledgeNote(await readFile(path, "utf8"));
    if (note.workspaceId !== workspace.id) {
      throw new Error(`Knowledge Note ${note.id} crosses a Workspace boundary.`);
    }
    const relativePath = toPortablePath(relative(libraryRoot, path));
    records.push({
      candidate: {
        id: note.id,
        kind: "knowledge",
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        title: note.title,
        excerpt: excerpt(note.body),
        visibility: note.visibility,
        projectIds: [...note.projectIds],
        topics: [...note.topics],
        sourceIds: [...note.sourceIds],
        recordDate: note.updatedAt.slice(0, 10),
        status: note.status,
        noteLink: noteHref(relativePath),
      },
      fields: {
        path: relativePath,
        metadata: [
          workspace.id,
          workspace.slug,
          workspace.name,
          note.visibility,
          note.status,
          note.createdAt,
          note.updatedAt,
          ...note.topics,
          ...note.sourceIds,
          projectMetadata(workspace, note.projectIds),
        ].join(" "),
        heading: note.title,
        body: [note.body, ...note.examples, ...note.caveats].join(" "),
      },
      relationships: [...note.relationships],
    });
  }

  for (const path of worklogFiles) {
    const entries = parseWorklogMonth(await readFile(path, "utf8"));
    const relativePath = toPortablePath(relative(libraryRoot, path));
    for (const entry of entries) {
      if (entry.workspaceId !== workspace.id) {
        throw new Error(`Worklog Entry ${entry.id} crosses a Workspace boundary.`);
      }
      records.push({
        candidate: {
          id: entry.id,
          kind: "worklog",
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          title: `${entry.occurredOn} — ${entry.summary}`,
          excerpt: excerpt(entry.details),
          visibility: entry.visibility,
          projectIds: [...entry.projectIds],
          topics: [],
          sourceIds: [...entry.sourceIds],
          recordDate: entry.occurredOn,
          status: "current",
          noteLink: noteHref(relativePath),
        },
        fields: {
          path: relativePath,
          metadata: [
            workspace.id,
            workspace.slug,
            workspace.name,
            entry.visibility,
            entry.category,
            entry.occurredOn,
            ...entry.sourceIds,
            projectMetadata(workspace, entry.projectIds),
          ].join(" "),
          heading: `${entry.occurredOn} ${entry.summary}`,
          body: entry.details,
        },
        relationships: [],
      });
    }
  }
  return records;
}

function projectFilterIds(
  workspaces: readonly WorkspaceDocument[],
  requested: readonly string[] | undefined,
): Set<string> | undefined {
  if (requested === undefined || requested.length === 0) return undefined;
  const ids = new Set<string>();
  for (const reference of requested) {
    const matches = workspaces.flatMap(({ projects }) => projects)
      .filter(({ id, slug }) => id === reference || slug === reference);
    if (matches.length === 0) {
      throw new Error(`Recall project ${reference} is outside the selected Workspace scope.`);
    }
    for (const project of matches) ids.add(project.id);
  }
  return ids;
}

function passesFilters(
  record: IndexedRecord,
  options: RecallSearchOptions,
  allowedProjectIds: ReadonlySet<string> | undefined,
): boolean {
  const candidate = record.candidate;
  if (allowedProjectIds !== undefined && !candidate.projectIds.some((id) => allowedProjectIds.has(id))) {
    return false;
  }
  if (options.dateFrom !== undefined && candidate.recordDate < options.dateFrom) return false;
  if (options.dateTo !== undefined && candidate.recordDate > options.dateTo) return false;
  if (options.visibility !== undefined && !options.visibility.includes(candidate.visibility)) return false;
  if (options.topic !== undefined && options.topic.length > 0) {
    const available = new Set(candidate.topics.map((topic) => tokens(topic).join(" ")));
    if (!options.topic.some((topic) => available.has(tokens(topic).join(" ")))) return false;
  }
  return true;
}

function scoreRecord(
  indexed: IndexedRecord,
  queryTerms: readonly string[],
  expandedTerms: readonly string[],
): ScoredRecord | undefined {
  const matchedOriginal = new Set<string>();
  const matchedExpanded = new Set<string>();
  const matchedFields = new Set<RecallMatchedField>();
  let score = indexed.candidate.status === "superseded" ? -4 : 2;

  for (const [field, value] of Object.entries(indexed.fields) as Array<[RecallMatchedField, string]>) {
    const fieldTokens = new Set(tokens(value));
    for (const term of queryTerms) {
      if (!fieldTokens.has(term)) continue;
      matchedOriginal.add(term);
      matchedFields.add(field);
      score += FIELD_WEIGHTS[field];
    }
    for (const term of expandedTerms) {
      if (!fieldTokens.has(term)) continue;
      matchedExpanded.add(term);
      matchedFields.add(field);
      score += Math.max(1, Math.floor(FIELD_WEIGHTS[field] / 2));
    }
  }

  if (queryTerms.some((term) => ["current", "latest", "now"].includes(term)) && indexed.candidate.status === "current") {
    score += 8;
  }
  if (matchedOriginal.size === 0 && matchedExpanded.size < 2) return undefined;
  if (score < 4) return undefined;
  return {
    indexed,
    score,
    matchedTerms: [...new Set([...matchedOriginal, ...matchedExpanded])].sort(),
    matchedFields: [...matchedFields],
  };
}

function compareScored(left: ScoredRecord, right: ScoredRecord): number {
  if (left.score !== right.score) return right.score - left.score;
  if (left.indexed.candidate.recordDate !== right.indexed.candidate.recordDate) {
    return right.indexed.candidate.recordDate.localeCompare(left.indexed.candidate.recordDate);
  }
  return left.indexed.candidate.id.localeCompare(right.indexed.candidate.id);
}

function includeRelationshipSuccessors(
  scored: ScoredRecord[],
  filteredRecords: readonly IndexedRecord[],
): ScoredRecord[] {
  const byId = new Map(filteredRecords.map((record) => [record.candidate.id, record]));
  const byTarget = new Map<string, IndexedRecord[]>();
  for (const record of filteredRecords) {
    for (const relationship of record.relationships) {
      if (relationship.type !== "supersedes" && relationship.type !== "updates") continue;
      const related = byTarget.get(relationship.targetId) ?? [];
      related.push(record);
      byTarget.set(relationship.targetId, related);
    }
  }
  const included = new Map(scored.map((record) => [record.indexed.candidate.id, record]));
  const pending = [...scored];
  for (let index = 0; index < pending.length; index += 1) {
    const result = pending[index];
    if (result === undefined) continue;
    for (const successor of byTarget.get(result.indexed.candidate.id) ?? []) {
      if (included.has(successor.candidate.id) || !byId.has(successor.candidate.id)) continue;
      const promoted: ScoredRecord = {
        indexed: successor,
        score: result.score + 1,
        matchedTerms: [...result.matchedTerms],
        matchedFields: [...result.matchedFields],
      };
      included.set(successor.candidate.id, promoted);
      scored.push(promoted);
      pending.push(promoted);
    }
  }
  return scored;
}

function toCandidates(scored: readonly ScoredRecord[]): RecallCandidate[] {
  const scoredIds = new Set(scored.map(({ indexed }) => indexed.candidate.id));
  return scored.map(({ indexed, score, matchedTerms, matchedFields }) => ({
    ...indexed.candidate,
    score,
    matchedTerms: [...matchedTerms],
    matchedFields: [...matchedFields],
    supersededIds: indexed.relationships
      .filter(({ type, targetId }) => (type === "supersedes" || type === "updates") && scoredIds.has(targetId))
      .map(({ targetId }) => targetId),
  }));
}

function enforceSuccessorOrder(candidates: readonly RecallCandidate[]): RecallCandidate[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const originalIndex = new Map(candidates.map((candidate, index) => [candidate.id, index]));
  const outgoing = new Map<string, Set<string>>();
  const indegree = new Map(candidates.map((candidate) => [candidate.id, 0]));
  for (const candidate of candidates) {
    for (const targetId of candidate.supersededIds) {
      if (!byId.has(targetId)) continue;
      const targets = outgoing.get(candidate.id) ?? new Set<string>();
      if (targets.has(targetId)) continue;
      targets.add(targetId);
      outgoing.set(candidate.id, targets);
      indegree.set(targetId, (indegree.get(targetId) ?? 0) + 1);
    }
  }

  const ready = candidates
    .filter(({ id }) => indegree.get(id) === 0)
    .map(({ id }) => id);
  const ordered: RecallCandidate[] = [];
  while (ready.length > 0) {
    ready.sort((left, right) => (originalIndex.get(left) ?? 0) - (originalIndex.get(right) ?? 0));
    const id = ready.shift();
    if (id === undefined) break;
    const candidate = byId.get(id);
    if (candidate !== undefined) ordered.push(candidate);
    for (const targetId of outgoing.get(id) ?? []) {
      const remaining = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, remaining);
      if (remaining === 0) ready.push(targetId);
    }
  }
  if (ordered.length !== candidates.length) {
    throw new Error("Knowledge relationships contain a supersession cycle; resolve it before Recall.");
  }
  return ordered;
}

export async function searchRecallCandidates(
  options: RecallSearchOptions,
): Promise<RecallSearchResult> {
  validateOptions(options);
  await ensureLibraryInitialized(options.libraryDirectory);
  const libraryRoot = await realpath(options.libraryDirectory);
  const selected = await selectedWorkspaces(
    libraryRoot,
    options.workspace,
    options.includeArchived === true,
  );
  const queryTerms = tokens(options.query);
  if (queryTerms.length === 0) throw new Error("Recall question has no searchable terms.");
  const expandedTerms = queryExpansion(queryTerms);

  if (selected.ambiguous) {
    return {
      status: "needs-workspace",
      query: options.query.trim(),
      queryTerms,
      expandedTerms,
      workspaceChoices: selected.choices,
      candidates: [],
    };
  }

  const allowedProjectIds = projectFilterIds(selected.workspaces, options.project);
  const indexed = (await Promise.all(
    selected.workspaces.map((workspace) => indexWorkspace(libraryRoot, workspace)),
  )).flat();
  const filtered = indexed.filter((record) => passesFilters(record, options, allowedProjectIds));
  const scored = filtered
    .map((record) => scoreRecord(record, queryTerms, expandedTerms))
    .filter((record): record is ScoredRecord => record !== undefined);
  includeRelationshipSuccessors(scored, filtered);
  scored.sort(compareScored);
  const candidates = enforceSuccessorOrder(toCandidates(scored))
    .slice(0, options.maxCandidates ?? 12);

  return {
    status: "ready",
    query: options.query.trim(),
    queryTerms,
    expandedTerms,
    workspaceChoices: selected.choices,
    candidates,
  };
}

function applyAgentReranking(
  candidates: readonly RecallCandidate[],
  rerankedIds: readonly string[] | undefined,
): RecallCandidate[] {
  if (rerankedIds === undefined) return [...candidates];
  const available = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const seen = new Set<string>();
  const ordered: RecallCandidate[] = [];
  for (const id of rerankedIds) {
    if (seen.has(id)) throw new Error(`Recall reranking repeats candidate ${id}.`);
    const candidate = available.get(id);
    if (candidate === undefined) throw new Error(`${id} is not a retrieved Recall candidate.`);
    ordered.push(candidate);
    seen.add(id);
  }
  ordered.push(...candidates.filter(({ id }) => !seen.has(id)));
  return enforceSuccessorOrder(ordered);
}

function answerForCandidates(candidates: readonly RecallCandidate[]): string {
  const supersededIds = new Set(candidates.flatMap(({ supersededIds }) => supersededIds));
  const history = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const primary = candidates
    .filter(({ id }) => !supersededIds.has(id))
    .slice(0, 3);
  const lines = primary.map((candidate) => {
    const link = `[${markdownText(candidate.title)}](${candidate.noteLink})`;
    let line = `${markdownText(candidate.excerpt)} ${link}.`;
    const older = candidate.supersededIds
      .map((id) => history.get(id))
      .filter((value): value is RecallCandidate => value !== undefined);
    if (older.length > 0) {
      const links = older.map((record) => `[${markdownText(record.title)}](${record.noteLink})`);
      line += ` This supersedes older guidance: ${links.join(", ")}.`;
    } else if (candidate.status === "superseded") {
      line += " This record is superseded; verify current guidance before relying on it.";
    }
    return line;
  });
  if (lines.length === 1) return lines[0] ?? "";
  return lines.map((line) => `- ${line}`).join("\n");
}

export async function recallFromLibrary(options: RecallOptions): Promise<RecallResult> {
  const search = await searchRecallCandidates(options);
  if (search.status === "needs-workspace") {
    const names = search.workspaceChoices.map(({ name }) => name).join(", ");
    return {
      status: "needs-workspace",
      answer: names.length === 0
        ? "No active Workspace is available. Choose or create a Workspace before Recall."
        : `Which Workspace should I search? Active choices: ${names}.`,
      query: search.query,
      queryTerms: search.queryTerms,
      expandedTerms: search.expandedTerms,
      workspaceChoices: search.workspaceChoices,
      candidates: [],
    };
  }

  const candidates = applyAgentReranking(search.candidates, options.rerankedIds);
  if (candidates.length === 0) {
    const workspaceNames = search.workspaceChoices.map(({ name }) => name).join(", ");
    return {
      status: "no-results",
      answer: `I couldn’t find a matching Work Library record in ${workspaceNames}.`,
      query: search.query,
      queryTerms: search.queryTerms,
      expandedTerms: search.expandedTerms,
      workspaceChoices: search.workspaceChoices,
      candidates: [],
    };
  }
  return {
    status: "found",
    answer: answerForCandidates(candidates),
    query: search.query,
    queryTerms: search.queryTerms,
    expandedTerms: search.expandedTerms,
    workspaceChoices: search.workspaceChoices,
    candidates,
  };
}
