#!/usr/bin/env node

import { readFileSync } from "node:fs";

import { assertSupportedNode, PRODUCT_NAME } from "../index.js";

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
      "",
      "Report, Work Library, review, and installation commands arrive in later gates.",
      "",
    ].join("\n"),
  );
}

assertSupportedNode();

const argument = process.argv[2];

if (argument === undefined || argument === "--help" || argument === "-h") {
  printHelp();
} else if (argument === "--version" || argument === "-v") {
  process.stdout.write(`${packageVersion()}\n`);
} else {
  process.stderr.write(`Unknown argument: ${argument}\n`);
  process.exitCode = 1;
}
