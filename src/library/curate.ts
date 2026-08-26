import { createHash, randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { join } from "node:path";

import { readKnowledgeNotes } from "./capture.js";
import { serializeKnowledgeNote } from "./markdown.js";
import {
  applyLibraryMutationUnlocked,
  withRecoveredLibraryLock,
} from "./persistence.js";
import type {
  KnowledgeNote,
  KnowledgeRelationship,
  WorkspaceDocument,
} from "./types.js";
import { ensureLibraryInitialized, loadWorkspace } from "./workspace.js";

export type CurationCandidateKind =
  | "duplicate"
  | "contradiction"
  | "stale-note"
  | "missing-link"
  | "broad-note";

export type CurationOperationKind =
  | "merge"
  | "move"
  | "rewrite"
  | "relation"
  | "supersession";

export interface CurationCandidate {
  id: string;
  workspaceId: string;
  kind: CurationCandidateKind;
  noteIds: string[];
  noteHashes: Record<string, string>;
  reason: string;
  suggestedOperationKinds: CurationOperationKind[];
}

export interface CurationWorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  archived: boolean;
  projects: Array<{ id: string; slug: string; name: string }>;
}

export interface CurationDiscoveryResult {
  schemaVersion: "1.0.0";
  workspace: CurationWorkspaceSummary;
  noteHashes: Record<string, string>;
  candidates: CurationCandidate[];
}

export interface MergeCurationOperation {
  kind: "merge";
  canonicalId: string;
  duplicateIds: string[];
}

export interface MoveCurationOperation {
  kind: "move";
  noteId: string;
  projectIds: string[];
}

export interface RewriteCurationOperation {
  kind: "rewrite";
  noteId: string;
  title?: string;
  body?: string;
  topics?: string[];
  examples?: string[];
  caveats?: string[];
}

export interface RelationCurationOperation {
  kind: "relation";
  leftId: string;
  rightId: string;
}

export interface SupersessionCurationOperation {
  kind: "supersession";
  successorId: string;
  supersededId: string;
}

export type CurationOperation =
  | MergeCurationOperation
  | MoveCurationOperation
  | RewriteCurationOperation
  | RelationCurationOperation
  | SupersessionCurationOperation;

export interface CurationProposal {
  schemaVersion: "1.0.0";
  id: string;
  workspaceId: string;
  summary: string;
  candidateIds: string[];
  expectedNoteHashes: Record<string, string>;
  operations: CurationOperation[];
  createdAt: string;
}

export interface CreateCurationProposalInput {
  summary: string;
  candidateIds: string[];
  operations: CurationOperation[];
}

export interface CurationValidationResult {
  valid: boolean;
  errors: string[];
}

export interface DiscoverCurationCandidatesOptions {
  libraryDirectory: string;
  workspace: string;
  includeArchived?: boolean;
}

export interface ApplyCurationProposalOptions {
  libraryDirectory: string;
  workspace: string;
  proposal: CurationProposal;
  approved?: boolean;
  includeArchived?: boolean;
  now?: string;
}

export type ApplyCurationProposalResult =
  | {
      status: "rejected";
      proposalId: string;
      acknowledgement: string;
    }
  | {
      status: "applied";
      proposalId: string;
      mutationId: string;
      changedNoteIds: string[];
      acknowledgement: string;
    };

const CANDIDATE_ORDER: readonly CurationCandidateKind[] = [
  "duplicate",
  "contradiction",
  "stale-note",
  "missing-link",
  "broad-note",
];

const CORRECTION_LANGUAGE = /\b(?:instead|no longer|now|replaced|replaces|changed to)\b/iu;

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function shared(left: readonly string[], right: readonly string[]): boolean {
  const values = new Set(left);
  return right.some((value) => values.has(value));
}

function contentHash(note: KnowledgeNote): string {
  return createHash("sha256").update(serializeKnowledgeNote(note)).digest("hex");
}

function candidateId(
  kind: CurationCandidateKind,
  noteIds: readonly string[],
  noteHashes: Readonly<Record<string, string>>,
): string {
  const signature = [kind, ...[...noteIds].sort().flatMap((id) => [id, noteHashes[id] ?? "missing"])]
    .join("\u0000");
  return `curcand_${createHash("sha256").update(signature).digest("hex").slice(0, 24)}`;
}

function makeCandidate(
  workspaceId: string,
  kind: CurationCandidateKind,
  notes: readonly KnowledgeNote[],
  hashes: Readonly<Record<string, string>>,
  reason: string,
  suggestedOperationKinds: CurationOperationKind[],
): CurationCandidate {
  const noteIds = notes.map(({ id }) => id).sort();
  return {
    id: candidateId(kind, noteIds, hashes),
    workspaceId,
    kind,
    noteIds,
    noteHashes: Object.fromEntries(noteIds.map((id) => [id, hashes[id] ?? ""])),
    reason,
    suggestedOperationKinds,
  };
}

function pairKey(left: KnowledgeNote, right: KnowledgeNote): string {
  return [left.id, right.id].sort().join("\u0000");
}

function directlyRelated(left: KnowledgeNote, right: KnowledgeNote): boolean {
  return left.relationships.some(({ targetId }) => targetId === right.id)
    || right.relationships.some(({ targetId }) => targetId === left.id);
}

function discoverFromNotes(
  workspace: WorkspaceDocument,
  notes: readonly KnowledgeNote[],
): CurationDiscoveryResult {
  const hashes = Object.fromEntries(notes.map((note) => [note.id, contentHash(note)]));
  const candidates: CurationCandidate[] = [];
  const duplicatePairs = new Set<string>();
  const contradictionPairs = new Set<string>();
  const current = notes.filter(({ status }) => status === "current");

  for (let leftIndex = 0; leftIndex < current.length; leftIndex += 1) {
    const left = current[leftIndex];
    if (left === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < current.length; rightIndex += 1) {
      const right = current[rightIndex];
      if (right === undefined) continue;
      const key = pairKey(left, right);
      if (normalized(left.body) === normalized(right.body)
        || normalized(left.title) === normalized(right.title)) {
        duplicatePairs.add(key);
        candidates.push(makeCandidate(
          workspace.id,
          "duplicate",
          [left, right],
          hashes,
          "Two current Knowledge Notes repeat the same title or body; review a history-preserving merge.",
          ["merge"],
        ));
        continue;
      }
      if (shared(left.topics, right.topics)
        && shared(left.projectIds, right.projectIds)
        && (CORRECTION_LANGUAGE.test(left.body) || CORRECTION_LANGUAGE.test(right.body))) {
        contradictionPairs.add(key);
        candidates.push(makeCandidate(
          workspace.id,
          "contradiction",
          [left, right],
          hashes,
          "Two current notes share scope while one uses corrective language; confirm which guidance supersedes the other.",
          ["supersession"],
        ));
      }
    }
  }

  for (const note of notes.filter(({ status }) => status === "superseded")) {
    candidates.push(makeCandidate(
      workspace.id,
      "stale-note",
      [note],
      hashes,
      "This Knowledge Note is superseded and should remain as history while its current context is reviewed.",
      ["rewrite"],
    ));
  }

  for (let leftIndex = 0; leftIndex < current.length; leftIndex += 1) {
    const left = current[leftIndex];
    if (left === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < current.length; rightIndex += 1) {
      const right = current[rightIndex];
      if (right === undefined) continue;
      const key = pairKey(left, right);
      if (duplicatePairs.has(key) || contradictionPairs.has(key) || directlyRelated(left, right)) {
        continue;
      }
      if (shared(left.sourceIds, right.sourceIds)) {
        candidates.push(makeCandidate(
          workspace.id,
          "missing-link",
          [left, right],
          hashes,
          "Two notes cite the same source but have no explicit relationship.",
          ["relation"],
        ));
      }
    }
  }

  for (const note of current) {
    if (note.topics.length >= 5 || note.body.length >= 800) {
      candidates.push(makeCandidate(
        workspace.id,
        "broad-note",
        [note],
        hashes,
        "This note spans many topics or an unusually broad body; review its focus and project placement.",
        ["rewrite", "move"],
      ));
    }
  }

  const order = new Map(CANDIDATE_ORDER.map((kind, index) => [kind, index]));
  candidates.sort((left, right) => {
    const byKind = (order.get(left.kind) ?? 0) - (order.get(right.kind) ?? 0);
    return byKind === 0 ? left.id.localeCompare(right.id) : byKind;
  });
  return {
    schemaVersion: "1.0.0",
    workspace: {
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
      archived: workspace.archived,
      projects: workspace.projects.map(({ id, slug, name }) => ({ id, slug, name })),
    },
    noteHashes: hashes,
    candidates,
  };
}

export async function discoverCurationCandidates(
  options: DiscoverCurationCandidatesOptions,
): Promise<CurationDiscoveryResult> {
  await ensureLibraryInitialized(options.libraryDirectory);
  const libraryRoot = await realpath(options.libraryDirectory);
  const workspace = await loadWorkspace(libraryRoot, options.workspace, {
    includeArchived: options.includeArchived === true,
  });
  const notes = await readKnowledgeNotes(libraryRoot, workspace.id, {
    includeArchived: options.includeArchived === true,
  });
  return discoverFromNotes(workspace, notes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function operationNoteIds(operation: unknown, errors: string[], index: number): string[] {
  if (!isRecord(operation) || typeof operation.kind !== "string") {
    errors.push(`Curation operation ${String(index)} has an invalid shape.`);
    return [];
  }
  switch (operation.kind) {
    case "merge": {
      if (typeof operation.canonicalId !== "string"
        || !stringArray(operation.duplicateIds)
        || operation.duplicateIds.length === 0
        || operation.duplicateIds.includes(operation.canonicalId)
        || new Set(operation.duplicateIds).size !== operation.duplicateIds.length) {
        errors.push(`Curation merge operation ${String(index)} is invalid.`);
        return [];
      }
      return [operation.canonicalId, ...operation.duplicateIds];
    }
    case "move": {
      if (typeof operation.noteId !== "string"
        || !stringArray(operation.projectIds)
        || operation.projectIds.length === 0
        || new Set(operation.projectIds).size !== operation.projectIds.length) {
        errors.push(`Curation move operation ${String(index)} is invalid.`);
        return [];
      }
      return [operation.noteId];
    }
    case "rewrite": {
      const replacementFields = ["title", "body", "topics", "examples", "caveats"]
        .filter((field) => operation[field] !== undefined);
      if (typeof operation.noteId !== "string" || replacementFields.length === 0) {
        errors.push(`Curation rewrite operation ${String(index)} is invalid.`);
        return [];
      }
      if ((operation.title !== undefined && (typeof operation.title !== "string" || operation.title.trim() === ""))
        || (operation.body !== undefined && (typeof operation.body !== "string" || operation.body.trim() === ""))
        || (operation.topics !== undefined && (!stringArray(operation.topics) || operation.topics.length === 0))
        || (operation.examples !== undefined && !stringArray(operation.examples))
        || (operation.caveats !== undefined && !stringArray(operation.caveats))) {
        errors.push(`Curation rewrite operation ${String(index)} has invalid replacement content.`);
        return [];
      }
      return [operation.noteId];
    }
    case "relation": {
      if (typeof operation.leftId !== "string"
        || typeof operation.rightId !== "string"
        || operation.leftId === operation.rightId) {
        errors.push(`Curation relation operation ${String(index)} is invalid.`);
        return [];
      }
      return [operation.leftId, operation.rightId];
    }
    case "supersession": {
      if (typeof operation.successorId !== "string"
        || typeof operation.supersededId !== "string"
        || operation.successorId === operation.supersededId) {
        errors.push(`Curation supersession operation ${String(index)} is invalid.`);
        return [];
      }
      return [operation.successorId, operation.supersededId];
    }
    default:
      errors.push(`Unknown Curation operation kind: ${operation.kind}.`);
      return [];
  }
}

function operationKind(operation: unknown): CurationOperationKind | undefined {
  if (!isRecord(operation) || typeof operation.kind !== "string") return undefined;
  return ["merge", "move", "rewrite", "relation", "supersession"].includes(operation.kind)
    ? operation.kind as CurationOperationKind
    : undefined;
}

function candidateSupportsOperation(
  candidate: CurationCandidate,
  operation: unknown,
  noteIds: readonly string[],
): boolean {
  const kind = operationKind(operation);
  return kind !== undefined
    && candidate.suggestedOperationKinds.includes(kind)
    && noteIds.every((id) => candidate.noteIds.includes(id));
}

export function validateCurationProposal(
  proposal: unknown,
  discovery: CurationDiscoveryResult,
): CurationValidationResult {
  const errors: string[] = [];
  if (!isRecord(proposal)) return { valid: false, errors: ["Curation proposal must be an object."] };
  if (proposal.schemaVersion !== "1.0.0") errors.push("Curation proposal schemaVersion must be 1.0.0.");
  if (typeof proposal.id !== "string"
    || !/^cur_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(proposal.id)) {
    errors.push("Curation proposal has an invalid ID.");
  }
  if (proposal.workspaceId !== discovery.workspace.id) {
    errors.push("Curation proposal Workspace does not match the selected Workspace.");
  }
  if (typeof proposal.summary !== "string" || proposal.summary.trim().length === 0) {
    errors.push("Curation proposal requires a summary.");
  }
  if (!stringArray(proposal.candidateIds)
    || proposal.candidateIds.length === 0
    || new Set(proposal.candidateIds).size !== proposal.candidateIds.length) {
    errors.push("Curation proposal requires unique selected candidate IDs.");
  }
  if (!isRecord(proposal.expectedNoteHashes)) {
    errors.push("Curation proposal requires expected note hashes.");
  }
  if (!Array.isArray(proposal.operations) || proposal.operations.length === 0) {
    errors.push("Curation proposal requires at least one operation.");
  }
  if (typeof proposal.createdAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(proposal.createdAt)
    || Number.isNaN(Date.parse(proposal.createdAt))) {
    errors.push("Curation proposal requires a valid createdAt timestamp.");
  }

  const byCandidate = new Map(discovery.candidates.map((candidate) => [candidate.id, candidate]));
  const selectedCandidates: CurationCandidate[] = [];
  if (stringArray(proposal.candidateIds)) {
    for (const id of proposal.candidateIds) {
      const candidate = byCandidate.get(id);
      if (candidate === undefined) errors.push(`Curation proposal references unknown candidate ${id}.`);
      else selectedCandidates.push(candidate);
    }
  }

  const operationMatches = new Set<string>();
  if (Array.isArray(proposal.operations)) {
    proposal.operations.forEach((operation, index) => {
      const noteIds = operationNoteIds(operation, errors, index);
      const supporting = selectedCandidates.filter((candidate) => (
        candidateSupportsOperation(candidate, operation, noteIds)
      ));
      if (noteIds.length > 0 && supporting.length === 0) {
        errors.push(`Curation operation ${String(index)} does not match a selected candidate.`);
      }
      for (const candidate of supporting) operationMatches.add(candidate.id);
      for (const noteId of noteIds) {
        const expected = isRecord(proposal.expectedNoteHashes)
          ? proposal.expectedNoteHashes[noteId]
          : undefined;
        if (typeof expected !== "string" || !/^[a-f0-9]{64}$/u.test(expected)) {
          errors.push(`Curation proposal is missing the expected hash for Knowledge Note ${noteId}.`);
        } else if (discovery.noteHashes[noteId] !== expected) {
          errors.push(`Knowledge Note ${noteId} changed after the Curate proposal was created.`);
        }
      }
      if (isRecord(operation) && operation.kind === "move" && stringArray(operation.projectIds)) {
        const allowed = new Set(discovery.workspace.projects.map(({ id }) => id));
        if (operation.projectIds.some((id) => !allowed.has(id))) {
          errors.push(`Curation move operation ${String(index)} targets a project outside the selected Workspace.`);
        }
      }
    });
  }
  for (const candidate of selectedCandidates) {
    if (!operationMatches.has(candidate.id)) {
      errors.push(`Selected candidate ${candidate.id} has no matching Curation operation.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function createCurationProposal(
  discovery: CurationDiscoveryResult,
  input: CreateCurationProposalInput,
  now = new Date().toISOString(),
): CurationProposal {
  const byCandidate = new Map(discovery.candidates.map((candidate) => [candidate.id, candidate]));
  const selected = input.candidateIds.map((id) => byCandidate.get(id)).filter((candidate) => candidate !== undefined);
  const expectedNoteHashes = Object.fromEntries(
    selected.flatMap((candidate) => Object.entries(candidate.noteHashes)),
  );
  const proposal: CurationProposal = {
    schemaVersion: "1.0.0",
    id: `cur_${randomUUID()}`,
    workspaceId: discovery.workspace.id,
    summary: input.summary.trim(),
    candidateIds: [...input.candidateIds],
    expectedNoteHashes,
    operations: structuredClone(input.operations),
    createdAt: now,
  };
  const validation = validateCurationProposal(proposal, discovery);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  return proposal;
}

function addRelationship(
  relationships: readonly KnowledgeRelationship[],
  relationship: KnowledgeRelationship,
): KnowledgeRelationship[] {
  if (relationships.some(({ type, targetId }) => (
    type === relationship.type && targetId === relationship.targetId
  ))) return [...relationships];
  return [...relationships, relationship];
}

function unionRelationships(
  relationships: readonly KnowledgeRelationship[],
  additions: readonly KnowledgeRelationship[],
  excludedIds: ReadonlySet<string>,
): KnowledgeRelationship[] {
  let combined = [...relationships];
  for (const relationship of additions) {
    if (excludedIds.has(relationship.targetId)) continue;
    combined = addRelationship(combined, relationship);
  }
  return combined;
}

function requireNote(notes: ReadonlyMap<string, KnowledgeNote>, id: string): KnowledgeNote {
  const note = notes.get(id);
  if (note === undefined) throw new Error(`Knowledge Note ${id} is outside the selected Workspace.`);
  return note;
}

function applyOperation(
  notes: Map<string, KnowledgeNote>,
  operation: CurationOperation,
  now: string,
): void {
  switch (operation.kind) {
    case "merge": {
      let canonical = requireNote(notes, operation.canonicalId);
      const duplicateSet = new Set(operation.duplicateIds);
      for (const duplicateId of operation.duplicateIds) {
        const duplicate = requireNote(notes, duplicateId);
        canonical = {
          ...canonical,
          projectIds: unique([...canonical.projectIds, ...duplicate.projectIds]),
          topics: unique([...canonical.topics, ...duplicate.topics]),
          examples: unique([...canonical.examples, ...duplicate.examples]),
          caveats: unique([...canonical.caveats, ...duplicate.caveats]),
          sourceIds: unique([...canonical.sourceIds, ...duplicate.sourceIds]),
          relationships: addRelationship(
            unionRelationships(
              canonical.relationships,
              duplicate.relationships,
              new Set([canonical.id, ...duplicateSet]),
            ),
            { type: "supersedes", targetId: duplicate.id },
          ),
          updatedAt: now,
        };
        notes.set(duplicate.id, { ...duplicate, status: "superseded", updatedAt: now });
      }
      notes.set(canonical.id, canonical);
      return;
    }
    case "move": {
      const note = requireNote(notes, operation.noteId);
      notes.set(note.id, { ...note, projectIds: [...operation.projectIds], updatedAt: now });
      return;
    }
    case "rewrite": {
      const note = requireNote(notes, operation.noteId);
      notes.set(note.id, {
        ...note,
        ...(operation.title === undefined ? {} : { title: operation.title.trim() }),
        ...(operation.body === undefined ? {} : { body: operation.body.trim() }),
        ...(operation.topics === undefined ? {} : { topics: unique(operation.topics) }),
        ...(operation.examples === undefined ? {} : { examples: unique(operation.examples) }),
        ...(operation.caveats === undefined ? {} : { caveats: unique(operation.caveats) }),
        updatedAt: now,
      });
      return;
    }
    case "relation": {
      const left = requireNote(notes, operation.leftId);
      const right = requireNote(notes, operation.rightId);
      notes.set(left.id, {
        ...left,
        relationships: addRelationship(left.relationships, { type: "related", targetId: right.id }),
        updatedAt: now,
      });
      notes.set(right.id, {
        ...right,
        relationships: addRelationship(right.relationships, { type: "related", targetId: left.id }),
        updatedAt: now,
      });
      return;
    }
    case "supersession": {
      const successor = requireNote(notes, operation.successorId);
      const superseded = requireNote(notes, operation.supersededId);
      notes.set(successor.id, {
        ...successor,
        status: "current",
        relationships: addRelationship(
          successor.relationships,
          { type: "supersedes", targetId: superseded.id },
        ),
        updatedAt: now,
      });
      notes.set(superseded.id, { ...superseded, status: "superseded", updatedAt: now });
    }
  }
}

function rejectedProposalId(proposal: unknown): string {
  return isRecord(proposal) && typeof proposal.id === "string" ? proposal.id : "unvalidated";
}

export async function applyCurationProposal(
  options: ApplyCurationProposalOptions,
): Promise<ApplyCurationProposalResult> {
  if (options.approved !== true) {
    const proposalId = rejectedProposalId(options.proposal);
    return {
      status: "rejected",
      proposalId,
      acknowledgement: `Curate proposal ${proposalId} was not applied; no Work Library files changed.`,
    };
  }

  await ensureLibraryInitialized(options.libraryDirectory);
  const libraryRoot = await realpath(options.libraryDirectory);
  return withRecoveredLibraryLock(libraryRoot, async () => {
    const workspace = await loadWorkspace(libraryRoot, options.workspace, {
      includeArchived: options.includeArchived === true,
    });
    const notes = await readKnowledgeNotes(libraryRoot, workspace.id, {
      includeArchived: options.includeArchived === true,
    });
    const discovery = discoverFromNotes(workspace, notes);
    if (!isRecord(options.proposal.expectedNoteHashes)) {
      const invalid = validateCurationProposal(options.proposal, discovery);
      throw new Error(invalid.errors.join("\n"));
    }
    for (const [noteId, expectedHash] of Object.entries(options.proposal.expectedNoteHashes)) {
      if (discovery.noteHashes[noteId] !== expectedHash) {
        throw new Error(`Knowledge Note ${noteId} changed after the Curate proposal was created.`);
      }
    }
    const validation = validateCurationProposal(options.proposal, discovery);
    if (!validation.valid) throw new Error(validation.errors.join("\n"));

    const now = options.now ?? new Date().toISOString();
    const originals = new Map(notes.map((note) => [note.id, note]));
    const updated = new Map(notes.map((note) => [note.id, structuredClone(note)]));
    for (const operation of options.proposal.operations) applyOperation(updated, operation, now);

    const changes = [...updated.values()].flatMap((note) => {
      const original = requireNote(originals, note.id);
      const before = serializeKnowledgeNote(original);
      const after = serializeKnowledgeNote(note);
      if (before === after) return [];
      return [{
        path: join(libraryRoot, "workspaces", workspace.slug, "knowledge", `${note.id}.md`),
        before,
        after,
      }];
    });
    if (changes.length === 0) throw new Error("The approved Curate proposal produces no changes.");
    const mutation = await applyLibraryMutationUnlocked(
      libraryRoot,
      workspace.id,
      `Curate: ${options.proposal.summary}`,
      changes,
      { now },
    );
    const changedNoteIds = changes.map(({ path }) => path.slice(path.lastIndexOf("/") + 1, -3)).sort();
    return {
      status: "applied",
      proposalId: options.proposal.id,
      mutationId: mutation.id,
      changedNoteIds,
      acknowledgement: `Curate proposal ${options.proposal.id} applied in ${workspace.name}.`,
    };
  });
}
