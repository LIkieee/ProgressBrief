import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertSupportedNode, MINIMUM_NODE_MAJOR } from "../../src/index.ts";

import {
  GATE_SUITES,
  assertGateScriptsAvailable,
  commandsForGate,
} from "../../scripts/gate-map.mjs";

const root = new URL("../../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("package locks the Node 24 ESM foundation and stable Gate 0 commands", async () => {
  const packageJson = JSON.parse(await read("package.json"));

  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.engines.node, ">=24");
  assert.equal(packageJson.bin.progressbrief, "./dist/cli/main.js");

  for (const script of [
    "build",
    "lint",
    "typecheck",
    "test:foundation",
    "validate:ci",
    "validate:skills",
    "verify:gate",
    "verify",
  ]) {
    assert.equal(typeof packageJson.scripts[script], "string", `${script} must exist`);
  }
});

test("runtime guard rejects pre-24 Node versions", () => {
  assert.equal(MINIMUM_NODE_MAJOR, 24);
  assert.doesNotThrow(() => assertSupportedNode("24.0.0"));
  assert.throws(() => assertSupportedNode("23.11.1"), /requires Node\.js 24/);
  assert.throws(() => assertSupportedNode("unknown"), /requires Node\.js 24/);
});

test("foundation documentation describes licensing, contribution, and security boundaries", async () => {
  const [license, readme, contributing, security] = await Promise.all([
    read("LICENSE"),
    read("README.md"),
    read("CONTRIBUTING.md"),
    read("SECURITY.md"),
  ]);

  assert.match(license, /MIT License/);
  assert.match(readme, /Snapshot/);
  assert.match(readme, /Deep Dive/);
  assert.match(readme, /Work Library/);
  assert.match(contributing, /Node\.js 24/);
  assert.match(contributing, /verify:gate/);
  assert.match(security, /credential/i);
  assert.match(security, /workspace/i);
});

test("gate map is cumulative and preserves every normative suite", async () => {
  assert.equal(GATE_SUITES.length, 11);
  assert.deepEqual(
    commandsForGate(0).map(({ label }) => label),
    ["install", "build", "lint", "typecheck", "foundation unit tests", "validate:skills", "validate:ci"],
  );
  assert.deepEqual(
    commandsForGate(10).map(({ label }) => label),
    [
      "install",
      "build",
      "lint",
      "typecheck",
      "foundation unit tests",
      "validate:skills",
      "validate:ci",
      "test:contracts",
      "test:report",
      "test:browser",
      "test:review",
      "test:library",
      "test:recall",
      "test:deep-dive",
      "test:curate",
      "test:install",
      "test:security",
      "release-content checks",
    ],
  );

  const packageJson = JSON.parse(await read("package.json"));
  for (let gate = 1; gate <= 10; gate += 1) {
    assert.throws(
      () => assertGateScriptsAvailable(gate, packageJson.scripts),
      /test:contracts/,
      `unimplemented Gate ${gate} must fail before execution`,
    );
  }
});
