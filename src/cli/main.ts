#!/usr/bin/env node

import { readFileSync } from "node:fs";

import {
  assertSupportedNode,
  captureMemory,
  initializeWorkLibrary,
  PRODUCT_NAME,
  startReviewServer,
  undoLastMutation,
} from "../index.js";

interface PackageMetadata {
  version: string;
}

function packageVersion(): string {
  const contents = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
  const metadata = JSON.parse(contents) as PackageMetadata;
  return metadata.version;
}

function printHelp(): void {
  process.stdout.write(
    [
      `${PRODUCT_NAME} ${packageVersion()}`,
      "",
      "Usage: progressbrief [--help] [--version]",
      "       progressbrief review --root <directory> --report-model <file> --report-html <file> --queue <file>",
      "       progressbrief library init --directory <directory> --workspace <name> --kind <employer|personal> [--project <name>] [--repository <directory>]",
      "       progressbrief memory capture --library <directory> --workspace <id-or-slug> --text <fragment> [--date <YYYY-MM-DD>]",
      "       progressbrief memory undo --library <directory> --workspace <id-or-slug>",
      "",
      "Commands:",
      "  review  Start the loopback-only creator review wrapper on a random port.",
      "  library Initialize a visible Work Library and Workspace.",
      "  memory  Persist Capture or Remember content, or undo the last Workspace mutation.",
      "",
      "Recall, Curate, and installation commands arrive in later gates.",
      "",
    ].join("\n"),
  );
}

function reviewOption(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index === -1 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`The review command requires ${name} <path>.`);
  }
  return value;
}

function parseOptions(arguments_: readonly string[], allowed: ReadonlySet<string>): Map<string, string> {
  const options = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index];
    const value = arguments_[index + 1];
    if (option === undefined || !allowed.has(option)) {
      throw new Error(`Unknown option: ${option ?? ""}`);
    }
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Option ${option} requires a value.`);
    }
    if (options.has(option)) throw new Error(`Option ${option} may be provided only once.`);
    options.set(option, value);
  }
  return options;
}

function requiredOption(options: ReadonlyMap<string, string>, name: string): string {
  const value = options.get(name);
  if (value === undefined) throw new Error(`The command requires ${name} <value>.`);
  return value;
}

async function runReview(arguments_: readonly string[]): Promise<void> {
  const known = new Set(["--root", "--report-model", "--report-html", "--queue"]);
  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index];
    if (option === undefined || !known.has(option)) {
      throw new Error(`Unknown review option: ${option ?? ""}`);
    }
  }
  const review = await startReviewServer({
    allowedRoot: reviewOption(arguments_, "--root"),
    reportModelPath: reviewOption(arguments_, "--report-model"),
    reportHtmlPath: reviewOption(arguments_, "--report-html"),
    feedbackQueuePath: reviewOption(arguments_, "--queue"),
  });
  process.stdout.write(`Creator review: ${review.url}\n`);
  process.stdout.write("Press Ctrl+C to stop the loopback review server.\n");
  await new Promise<void>((resolveShutdown) => {
    const shutdown = (): void => {
      void review.close().then(resolveShutdown);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

async function runLibrary(arguments_: readonly string[]): Promise<void> {
  const [action, ...rest] = arguments_;
  if (action !== "init") throw new Error(`Unknown library action: ${action ?? ""}`);
  const options = parseOptions(
    rest,
    new Set(["--directory", "--workspace", "--kind", "--project", "--repository"]),
  );
  const kind = requiredOption(options, "--kind");
  if (kind !== "employer" && kind !== "personal") {
    throw new Error("--kind must be employer or personal.");
  }
  const projectName = options.get("--project");
  const repositoryPath = options.get("--repository");
  const initialized = await initializeWorkLibrary({
    libraryDirectory: requiredOption(options, "--directory"),
    workspaceName: requiredOption(options, "--workspace"),
    workspaceKind: kind,
    ...(projectName === undefined ? {} : { projectName }),
    ...(repositoryPath === undefined ? {} : { repositoryPath }),
  });
  process.stdout.write(
    `Work Library ready at ${initialized.libraryRoot}; Workspace ${initialized.workspace.name} (${initialized.workspace.id}).\n`,
  );
}

async function runMemory(arguments_: readonly string[]): Promise<void> {
  const [action, ...rest] = arguments_;
  if (action !== "capture" && action !== "undo") {
    throw new Error(`Unknown memory action: ${action ?? ""}`);
  }
  const allowed = action === "capture"
    ? new Set(["--library", "--workspace", "--text", "--date"])
    : new Set(["--library", "--workspace"]);
  const options = parseOptions(rest, allowed);
  const libraryDirectory = requiredOption(options, "--library");
  const workspace = requiredOption(options, "--workspace");
  if (action === "undo") {
    const result = await undoLastMutation(libraryDirectory, workspace);
    process.stdout.write(`${result.acknowledgement}\n`);
    return;
  }
  const occurredOn = options.get("--date");
  const result = await captureMemory({
    libraryDirectory,
    workspace,
    text: requiredOption(options, "--text"),
    ...(occurredOn === undefined ? {} : { occurredOn }),
  });
  process.stdout.write(`${result.acknowledgement}\n`);
}

assertSupportedNode();

async function main(): Promise<void> {
  const argument = process.argv[2];

  if (argument === undefined || argument === "--help" || argument === "-h") {
    printHelp();
  } else if (argument === "--version" || argument === "-v") {
    process.stdout.write(`${packageVersion()}\n`);
  } else if (argument === "review") {
    await runReview(process.argv.slice(3));
  } else if (argument === "library") {
    await runLibrary(process.argv.slice(3));
  } else if (argument === "memory") {
    await runMemory(process.argv.slice(3));
  } else {
    throw new Error(`Unknown argument: ${argument}`);
  }
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
