import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  projectReportForExport,
  resolveReportRequest,
  resolveStructure,
  validateDeepDiveProposal,
  validateDocument,
  validateReportModel,
} from "../../dist/index.js";

const root = new URL("../../", import.meta.url);

async function fixture(name) {
  return JSON.parse(
    await readFile(new URL(`fixtures/deep-dive-reconciliation/${name}.json`, root), "utf8"),
  );
}

test("an explicit purpose resolves a Deep Dive without turning it into a long Snapshot", () => {
  const resolved = resolveReportRequest({
    prompt: "Prepare a deep dive for engineering and operations reviewers.",
    explicitMode: "deep-dive",
    audience: "Engineering and operations reviewers",
    purpose: "Explain the checkpoint decision and the validation still required before paging.",
    currentDate: "2026-08-26",
    explicitPeriod: { start: "2026-08-17", end: "2026-08-23" },
  });

  assert.equal(resolved.mode.mode, "deep-dive");
  assert.equal(resolved.mode.needsConfirmation, false);
  assert.match(resolved.purpose, /checkpoint decision/u);
  assert.doesNotMatch(resolved.purpose, /meaningful movement/u);
  assert.equal(resolved.requiresPersistenceSetup, false);
});

test("the evidence-led Deep Dive proposal is purpose-bounded and uses a flexible structure", async () => {
  const proposal = await fixture("agent-report-proposal");
  const snapshotEvidence = JSON.parse(
    await readFile(new URL("fixtures/snapshot-three-workstreams/evidence.json", root), "utf8"),
  );
  assert.deepEqual(validateDeepDiveProposal(proposal, snapshotEvidence), {
    valid: true,
    errors: [],
  });

  const structure = resolveStructure({ mode: "deep-dive", proposed: proposal.sections });
  assert.equal(structure.source, "agent-proposal");
  assert.equal(structure.needsConfirmation, true);
  assert.deepEqual(
    structure.sections.map(({ role }) => role),
    ["context", "decision-path", "validation", "implications"],
  );
  assert.deepEqual(proposal.selectedProjectIds, [
    "prj_20000000-0000-4000-8000-000000000002",
  ]);
});

test("Deep Dive proposal invariants reject scope drift and ungrounded claims", async () => {
  const proposal = await fixture("agent-report-proposal");
  const evidence = JSON.parse(
    await readFile(new URL("fixtures/snapshot-three-workstreams/evidence.json", root), "utf8"),
  );

  const scopeDrift = structuredClone(proposal);
  scopeDrift.sections[0].projectIds = ["prj_20000000-0000-4000-8000-000000000001"];
  assert.match(
    validateDeepDiveProposal(scopeDrift, evidence).errors.join(" "),
    /outside the selected Deep Dive scope/u,
  );

  const ungrounded = structuredClone(proposal);
  ungrounded.claims[0].sourceIds = [];
  assert.match(
    validateDeepDiveProposal(ungrounded, evidence).errors.join(" "),
    /consequential claim operations-window has no source/u,
  );

  const foreignSource = structuredClone(proposal);
  foreignSource.claims[0].sourceIds = ["src_30000000-0000-4000-8000-000000000002"];
  assert.match(
    validateDeepDiveProposal(foreignSource, evidence).errors.join(" "),
    /outside the selected project scope/u,
  );
});

test("the Deep Dive source model validates and exports through the existing report contract", async () => {
  const model = await fixture("golden-report-model");
  assert.deepEqual(validateDocument("report", model), { valid: true, errors: [] });
  assert.deepEqual(validateReportModel(model), { valid: true, errors: [] });
  assert.equal(model.mode, "deep-dive");

  const schemaNames = (await readdir(new URL("schemas/", root)))
    .filter((name) => name.endsWith(".schema.json"));
  assert.equal(schemaNames.includes("deep-dive.schema.json"), false);

  const exported = projectReportForExport(model);
  assert.equal(exported.mode, "deep-dive");
  assert.equal("creatorOnly" in exported, false);
  assert.doesNotMatch(JSON.stringify(exported), /ghp_fixture|\/Users\/casey/u);
});
