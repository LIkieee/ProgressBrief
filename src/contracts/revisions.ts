import type { RevisionedDocument } from "./types.js";

const UTC_TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?Z$/u;

export function advanceRevision<T extends RevisionedDocument>(
  document: T,
  createdAt: string,
  summary: string,
): T {
  if (!UTC_TIMESTAMP.test(createdAt) || Number.isNaN(Date.parse(createdAt))) {
    throw new Error("A revision requires a valid UTC timestamp.");
  }
  if (summary.trim().length === 0) {
    throw new Error("A revision requires a non-empty summary.");
  }

  const latest = document.revisionHistory.at(-1);
  if (latest?.revision !== document.revision) {
    throw new Error("Cannot revise a document whose revision history is inconsistent.");
  }

  const cloned = structuredClone(document);
  const revision = document.revision + 1;

  return {
    ...cloned,
    id: document.id,
    revision,
    revisionHistory: [
      ...cloned.revisionHistory,
      { revision, createdAt, summary: summary.trim() },
    ],
  };
}
