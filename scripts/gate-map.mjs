const gateZero = [
  { label: "install", executable: "npm", arguments: ["ci"] },
  { label: "build", script: "build" },
  { label: "lint", script: "lint" },
  { label: "typecheck", script: "typecheck" },
  { label: "foundation unit tests", script: "test:foundation" },
  { label: "validate:skills", script: "validate:skills" },
  { label: "validate:ci", script: "validate:ci" },
];

export const GATE_SUITES = [
  gateZero,
  [{ label: "test:contracts", script: "test:contracts" }],
  [{ label: "test:report", script: "test:report" }],
  [{ label: "test:browser", script: "test:browser" }],
  [{ label: "test:review", script: "test:review" }],
  [{ label: "test:library", script: "test:library" }],
  [{ label: "test:recall", script: "test:recall" }],
  [{ label: "test:deep-dive", script: "test:deep-dive" }],
  [{ label: "test:curate", script: "test:curate" }],
  [{ label: "test:install", script: "test:install" }],
  [
    { label: "test:security", script: "test:security" },
    { label: "release-content checks", script: "test:release" },
  ],
];

export function commandsForGate(gate) {
  if (!Number.isInteger(gate) || gate < 0 || gate >= GATE_SUITES.length) {
    throw new Error(`Gate must be an integer from 0 through ${GATE_SUITES.length - 1}.`);
  }

  return GATE_SUITES.slice(0, gate + 1).flat();
}

export function assertGateScriptsAvailable(gate, scripts) {
  const missing = commandsForGate(gate)
    .filter((command) => "script" in command)
    .map((command) => command.script)
    .filter((script) => typeof scripts[script] !== "string");

  if (missing.length > 0) {
    throw new Error(
      `Gate ${gate} is not implemented: missing package scripts ${missing.join(", ")}.`,
    );
  }
}
