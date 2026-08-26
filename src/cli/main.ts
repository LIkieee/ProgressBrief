#!/usr/bin/env node

import { readFileSync } from "node:fs";

import { assertSupportedNode, PRODUCT_NAME, startReviewServer } from "../index.js";

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
      "",
      "Commands:",
      "  review  Start the loopback-only creator review wrapper on a random port.",
      "",
      "Work Library and installation commands arrive in later gates.",
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

assertSupportedNode();

async function main(): Promise<void> {
  const argument = process.argv[2];

  if (argument === undefined || argument === "--help" || argument === "-h") {
    printHelp();
  } else if (argument === "--version" || argument === "-v") {
    process.stdout.write(`${packageVersion()}\n`);
  } else if (argument === "review") {
    await runReview(process.argv.slice(3));
  } else {
    throw new Error(`Unknown argument: ${argument}`);
  }
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
