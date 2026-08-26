import { execFile } from "node:child_process";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { createStableId } from "../contracts/ids.js";
import { parseWorkspace, serializeWorkspace } from "./markdown.js";
import { resolveAuthorizedLibraryPath, slugify } from "./paths.js";
import {
  applyLibraryMutationUnlocked,
  pathExists,
  undoMutation,
  withRecoveredLibraryLock,
} from "./persistence.js";
import type {
  LibraryConfig,
  RepositoryAssociation,
  WorkspaceDocument,
} from "./types.js";

const execFileAsync = promisify(execFile);

export interface InitializeWorkLibraryOptions {
  libraryDirectory: string;
  workspaceName: string;
  workspaceKind: "employer" | "personal";
  projectName?: string;
  repositoryPath?: string;
  canonicalRemoteUrl?: string;
  now?: string;
}

export interface InitializedWorkLibrary {
  libraryRoot: string;
  workspace: WorkspaceDocument;
  created: boolean;
}

function libraryConfigPath(libraryRoot: string): string {
  return join(libraryRoot, "config", "library.json");
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readLibraryConfig(libraryRoot: string): Promise<LibraryConfig> {
  const path = await resolveAuthorizedLibraryPath(libraryRoot, "config/library.json");
  const contents = await readOptional(path);
  if (contents === null) return { schemaVersion: "1.0.0", workspaces: [] };
  const config = JSON.parse(contents) as LibraryConfig;
  if (config.schemaVersion !== "1.0.0" || !Array.isArray(config.workspaces)) {
    throw new Error("The Work Library configuration is invalid.");
  }
  return config;
}

function serializeLibraryConfig(config: LibraryConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function normalizeGitHubRemote(remote: string): string {
  const trimmed = remote.trim();
  const https = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/u.exec(trimmed);
  if (https !== null) return `https://github.com/${https[1]}/${https[2]}`;
  const ssh = /^(?:git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/u.exec(trimmed);
  if (ssh !== null) return `https://github.com/${ssh[1]}/${ssh[2]}`;
  throw new Error("Repository association supports canonical GitHub remotes only.");
}

async function repositoryAssociation(
  repositoryPath: string | undefined,
  explicitRemote: string | undefined,
): Promise<RepositoryAssociation[]> {
  if (repositoryPath === undefined) {
    if (explicitRemote !== undefined) {
      throw new Error("A canonical remote cannot be associated without a repository path.");
    }
    return [];
  }
  const resolvedRealPath = await realpath(repositoryPath);
  let remote = explicitRemote;
  if (remote === undefined) {
    try {
      const result = await execFileAsync("git", [
        "-C",
        resolvedRealPath,
        "config",
        "--get",
        "remote.origin.url",
      ]);
      remote = result.stdout.trim() || undefined;
    } catch {
      remote = undefined;
    }
  }
  if (remote === undefined) return [{ resolvedRealPath }];
  try {
    return [{ resolvedRealPath, canonicalRemoteUrl: normalizeGitHubRemote(remote) }];
  } catch (error) {
    if (explicitRemote !== undefined) throw error;
    return [{ resolvedRealPath }];
  }
}

function workspaceRelativePath(slug: string): string {
  return `workspaces/${slug}/workspace.md`;
}

export async function loadWorkspace(
  libraryRoot: string,
  reference: string,
  options: { includeArchived?: boolean } = {},
): Promise<WorkspaceDocument> {
  const config = await readLibraryConfig(libraryRoot);
  const configured = config.workspaces.find(({ id, slug }) => id === reference || slug === reference);
  if (configured === undefined) throw new Error(`Workspace not found: ${reference}.`);
  const path = await resolveAuthorizedLibraryPath(libraryRoot, configured.relativePath);
  const workspace = parseWorkspace(await readFile(path, "utf8"));
  if (workspace.id !== configured.id || workspace.slug !== configured.slug) {
    throw new Error("Workspace configuration does not match its Markdown record.");
  }
  if (workspace.archived && options.includeArchived !== true) {
    throw new Error(`Cannot use archived Workspace ${workspace.name} without explicit selection.`);
  }
  return workspace;
}

export async function listActiveWorkspaces(libraryRoot: string): Promise<WorkspaceDocument[]> {
  const config = await readLibraryConfig(libraryRoot);
  const workspaces = await Promise.all(
    config.workspaces.map(({ id }) => loadWorkspace(libraryRoot, id, { includeArchived: true })),
  );
  return workspaces.filter(({ archived }) => !archived);
}

export async function initializeWorkLibrary(
  options: InitializeWorkLibraryOptions,
): Promise<InitializedWorkLibrary> {
  await mkdir(options.libraryDirectory, { recursive: true });
  const libraryRoot = await realpath(options.libraryDirectory);
  await mkdir(join(libraryRoot, "config"), { recursive: true });
  const workspaceSlug = slugify(options.workspaceName);
  const projectName = options.projectName ?? "General";
  const projectSlug = slugify(projectName);
  const associations = await repositoryAssociation(options.repositoryPath, options.canonicalRemoteUrl);
  const now = options.now ?? new Date().toISOString();

  return withRecoveredLibraryLock(libraryRoot, async () => {
    const configPath = libraryConfigPath(libraryRoot);
    const configBefore = await readOptional(configPath);
    const config = configBefore === null
      ? { schemaVersion: "1.0.0" as const, workspaces: [] }
      : (JSON.parse(configBefore) as LibraryConfig);
    const existing = config.workspaces.find(({ slug }) => slug === workspaceSlug);
    if (existing !== undefined) {
      return {
        libraryRoot,
        workspace: await loadWorkspace(libraryRoot, existing.id, { includeArchived: true }),
        created: false,
      };
    }

    const workspace: WorkspaceDocument = {
      schemaVersion: "1.0.0",
      id: createStableId("workspace"),
      slug: workspaceSlug,
      name: options.workspaceName.trim(),
      kind: options.workspaceKind,
      defaultVisibility: options.workspaceKind === "employer" ? "internal" : "private",
      archived: false,
      projects: [{
        id: createStableId("project"),
        slug: projectSlug,
        name: projectName.trim(),
        repositoryAssociations: associations,
      }],
      createdAt: now,
      updatedAt: now,
    };
    const relativePath = workspaceRelativePath(workspaceSlug);
    config.workspaces.push({ id: workspace.id, slug: workspace.slug, relativePath });
    const workspacePath = join(libraryRoot, relativePath);
    await Promise.all([
      mkdir(join(libraryRoot, "workspaces", workspaceSlug, "worklog"), { recursive: true }),
      mkdir(join(libraryRoot, "workspaces", workspaceSlug, "knowledge"), { recursive: true }),
      mkdir(join(libraryRoot, "workspaces", workspaceSlug, "reports"), { recursive: true }),
    ]);
    await applyLibraryMutationUnlocked(
      libraryRoot,
      workspace.id,
      `initialize Workspace ${workspace.name}`,
      [
        { path: configPath, before: configBefore, after: serializeLibraryConfig(config) },
        { path: workspacePath, before: null, after: serializeWorkspace(workspace) },
      ],
      { now },
    );
    return { libraryRoot, workspace, created: true };
  });
}

export async function setWorkspaceArchived(
  libraryRoot: string,
  reference: string,
  archived: boolean,
  now = new Date().toISOString(),
): Promise<WorkspaceDocument> {
  return withRecoveredLibraryLock(libraryRoot, async () => {
    const workspace = await loadWorkspace(libraryRoot, reference, { includeArchived: true });
    const path = await resolveAuthorizedLibraryPath(
      libraryRoot,
      workspaceRelativePath(workspace.slug),
    );
    const before = await readFile(path, "utf8");
    const updated: WorkspaceDocument = { ...workspace, archived, updatedAt: now };
    await applyLibraryMutationUnlocked(
      libraryRoot,
      workspace.id,
      `${archived ? "archive" : "restore"} Workspace ${workspace.name}`,
      [{ path, before, after: serializeWorkspace(updated) }],
      { now },
    );
    return updated;
  });
}

export async function undoLastMutation(
  libraryRoot: string,
  reference: string,
  now = new Date().toISOString(),
): Promise<{ acknowledgement: string }> {
  const workspace = await loadWorkspace(libraryRoot, reference, { includeArchived: true });
  await undoMutation(libraryRoot, workspace.id, now);
  return {
    acknowledgement: `Undid the last ProgressBrief mutation in ${workspace.name}.`,
  };
}

export async function ensureLibraryInitialized(libraryRoot: string): Promise<void> {
  const canonicalRoot = await realpath(libraryRoot);
  if (!(await pathExists(join(canonicalRoot, "config", "library.json")))) {
    throw new Error("Work Library setup is required before persistence. Choose a visible library directory first.");
  }
}
