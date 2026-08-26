import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { assertGateScriptsAvailable, commandsForGate } from "./gate-map.mjs";

const rawGate = process.argv[2];
const gate = Number(rawGate);

if (rawGate === undefined || !/^\d+$/u.test(rawGate)) {
  process.stderr.write("Usage: npm run verify:gate -- <gate-number>\n");
  process.exit(2);
}

let commands;

try {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assertGateScriptsAvailable(gate, packageJson.scripts ?? {});
  commands = commandsForGate(gate);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";

for (const command of commands) {
  const executable = "script" in command ? npmExecutable : command.executable;
  const arguments_ = "script" in command
    ? ["run", command.script]
    : command.arguments;

  process.stdout.write(`\n[gate ${gate}] ${command.label}\n`);
  const result = spawnSync(executable, arguments_, {
    cwd: new URL("../", import.meta.url),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error !== undefined) {
    process.stderr.write(`${command.label} could not start: ${result.error.message}\n`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.stderr.write(`${command.label} failed with status ${String(result.status)}.\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write(`\nGate ${gate} passed.\n`);
