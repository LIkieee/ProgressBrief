import { constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

function isInside(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference));
}

async function nearestExistingAncestor(candidate: string): Promise<string> {
  let current = candidate;
  for (;;) {
    try {
      await access(current, constants.F_OK);
      return current;
    } catch (error) {
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

export async function resolveAuthorizedLibraryPath(
  libraryDirectory: string,
  candidatePath: string,
): Promise<string> {
  const libraryRoot = await realpath(libraryDirectory);
  const lexicalCandidate = resolve(
    libraryRoot,
    isAbsolute(candidatePath) ? relative(libraryRoot, candidatePath) : candidatePath,
  );

  if (!isInside(libraryRoot, lexicalCandidate)) {
    throw new Error("The requested path is outside the configured Work Library.");
  }

  const existingAncestor = await nearestExistingAncestor(lexicalCandidate);
  const canonicalAncestor = await realpath(existingAncestor);
  if (!isInside(libraryRoot, canonicalAncestor)) {
    throw new Error("The requested path follows a symlink escape outside the configured Work Library.");
  }

  const unresolvedSuffix = relative(existingAncestor, lexicalCandidate);
  const canonicalCandidate = resolve(canonicalAncestor, unresolvedSuffix);
  if (!isInside(libraryRoot, canonicalCandidate)) {
    throw new Error("The requested path follows a symlink escape outside the configured Work Library.");
  }
  return canonicalCandidate;
}

export function assertSafeSlug(value: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) {
    throw new Error(`Unsafe Work Library slug: ${value}`);
  }
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80)
    .replace(/-+$/u, "");
  if (slug.length === 0) throw new Error("A Workspace or project name must contain letters or numbers.");
  assertSafeSlug(slug);
  return slug;
}
