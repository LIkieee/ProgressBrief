import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { resolveAuthorizedLibraryPath } from "./paths.js";
import type {
  LibraryMutation,
  LibraryMutationInput,
  MutationJournal,
} from "./types.js";

const DEFAULT_LOCK_TIMEOUT_MS = 1_500;
const DEFAULT_LOCK_POLL_MS = 20;

interface LockOwner {
  pid: number;
  createdAt: string;
}

export interface LibraryLockOptions {
  timeoutMs?: number;
  pollMs?: number;
}

export interface RunLibraryMutationOptions {
  now?: string;
  afterApply?: () => Promise<void>;
}

function timestamp(now?: string): string {
  return now ?? new Date().toISOString();
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function optionalRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function atomicWriteFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${String(process.pid)}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
  } catch (error) {
    if (handle !== undefined) await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function removeStaleLock(lockPath: string): Promise<boolean> {
  const ownerPath = join(lockPath, "owner.json");
  try {
    const owner = JSON.parse(await readFile(ownerPath, "utf8")) as LockOwner;
    if (processIsAlive(owner.pid)) return false;
    await rm(lockPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}

export async function withLibraryLock<T>(
  libraryDirectory: string,
  action: () => Promise<T>,
  options: LibraryLockOptions = {},
): Promise<T> {
  const configDirectory = await resolveAuthorizedLibraryPath(libraryDirectory, "config");
  await mkdir(configDirectory, { recursive: true });
  const lockPath = join(configDirectory, ".write.lock");
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_LOCK_POLL_MS;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      await mkdir(lockPath);
      await writeFile(
        join(lockPath, "owner.json"),
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      );
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await removeStaleLock(lockPath)) continue;
      if (Date.now() >= deadline) {
        throw new Error(
          `Work Library is busy; retry the operation after the active writer finishes (waited ${String(timeoutMs)} ms).`,
          { cause: error },
        );
      }
      await delay(pollMs);
    }
  }

  try {
    return await action();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

function journalPath(libraryRoot: string): string {
  return join(libraryRoot, "config", "mutation-journal.json");
}

async function readJournal(libraryRoot: string): Promise<MutationJournal> {
  const contents = await optionalRead(journalPath(libraryRoot));
  if (contents === null) return { schemaVersion: "1.0.0", mutations: [] };
  const journal = JSON.parse(contents) as MutationJournal;
  if (journal.schemaVersion !== "1.0.0" || !Array.isArray(journal.mutations)) {
    throw new Error("The Work Library mutation journal is invalid.");
  }
  return journal;
}

async function writeJournal(libraryRoot: string, journal: MutationJournal): Promise<void> {
  await atomicWriteFile(journalPath(libraryRoot), `${JSON.stringify(journal, null, 2)}\n`);
}

async function restoreChanges(
  libraryRoot: string,
  changes: readonly LibraryMutation["changes"][number][],
): Promise<void> {
  for (const change of [...changes].reverse()) {
    const path = await resolveAuthorizedLibraryPath(libraryRoot, change.relativePath);
    if (change.before === null) {
      await unlink(path).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      });
    } else {
      await atomicWriteFile(path, change.before);
    }
  }
}

async function recoverInterruptedMutationsUnlocked(libraryRoot: string): Promise<number> {
  const journal = await readJournal(libraryRoot);
  const prepared = journal.mutations.filter(({ status }) => status === "prepared");
  for (const mutation of prepared) {
    await restoreChanges(libraryRoot, mutation.changes);
    mutation.status = "rolled-back";
    mutation.completedAt = new Date().toISOString();
  }
  if (prepared.length > 0) await writeJournal(libraryRoot, journal);
  return prepared.length;
}

export async function recoverInterruptedMutations(libraryDirectory: string): Promise<number> {
  return withLibraryLock(libraryDirectory, async () => recoverInterruptedMutationsUnlocked(libraryDirectory));
}

export async function applyLibraryMutationUnlocked(
  libraryRoot: string,
  workspaceId: string,
  description: string,
  changes: readonly LibraryMutationInput[],
  options: RunLibraryMutationOptions = {},
): Promise<LibraryMutation> {
  if (changes.length === 0) throw new Error("A Work Library mutation must change at least one file.");
  const journal = await readJournal(libraryRoot);
  const preparedChanges: LibraryMutation["changes"] = [];
  const resolvedChanges: Array<LibraryMutationInput & { path: string }> = [];

  for (const change of changes) {
    const path = await resolveAuthorizedLibraryPath(libraryRoot, change.path);
    const current = await optionalRead(path);
    if (current !== change.before) {
      throw new Error(`Work Library content changed before mutation: ${relative(libraryRoot, path)}.`);
    }
    resolvedChanges.push({ ...change, path });
    preparedChanges.push({
      relativePath: relative(libraryRoot, path),
      before: change.before,
      afterHash: change.after === null ? null : hash(change.after),
    });
  }

  const mutation: LibraryMutation = {
    id: `mut_${randomUUID()}`,
    workspaceId,
    description,
    createdAt: timestamp(options.now),
    status: "prepared",
    changes: preparedChanges,
  };
  journal.mutations.push(mutation);
  await writeJournal(libraryRoot, journal);

  try {
    for (const change of resolvedChanges) {
      if (change.after === null) {
        await unlink(change.path).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        });
      } else {
        await atomicWriteFile(change.path, change.after);
      }
    }
    await options.afterApply?.();
    mutation.status = "committed";
    mutation.completedAt = timestamp(options.now);
    await writeJournal(libraryRoot, journal);
    return mutation;
  } catch (error) {
    await restoreChanges(libraryRoot, mutation.changes);
    mutation.status = "rolled-back";
    mutation.completedAt = timestamp(options.now);
    await writeJournal(libraryRoot, journal);
    throw error;
  }
}

export async function runLibraryMutation(
  libraryDirectory: string,
  workspaceId: string,
  description: string,
  changes: readonly LibraryMutationInput[],
  options: RunLibraryMutationOptions = {},
): Promise<LibraryMutation> {
  return withLibraryLock(libraryDirectory, async () => {
    await recoverInterruptedMutationsUnlocked(libraryDirectory);
    return applyLibraryMutationUnlocked(
      libraryDirectory,
      workspaceId,
      description,
      changes,
      options,
    );
  });
}

export async function withRecoveredLibraryLock<T>(
  libraryDirectory: string,
  action: () => Promise<T>,
  options: LibraryLockOptions = {},
): Promise<T> {
  return withLibraryLock(libraryDirectory, async () => {
    await recoverInterruptedMutationsUnlocked(libraryDirectory);
    return action();
  }, options);
}

export async function undoMutation(
  libraryDirectory: string,
  workspaceId: string,
  completedAt = new Date().toISOString(),
): Promise<LibraryMutation> {
  return withRecoveredLibraryLock(libraryDirectory, async () => {
    const journal = await readJournal(libraryDirectory);
    const mutation = [...journal.mutations]
      .reverse()
      .find((candidate) => candidate.workspaceId === workspaceId && candidate.status === "committed");
    if (mutation === undefined) throw new Error("There is no ProgressBrief mutation to undo in this Workspace.");
    await restoreChanges(libraryDirectory, mutation.changes);
    mutation.status = "undone";
    mutation.completedAt = completedAt;
    await writeJournal(libraryDirectory, journal);
    return mutation;
  });
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
