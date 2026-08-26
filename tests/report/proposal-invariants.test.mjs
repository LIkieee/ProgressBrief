import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateSnapshotProposal } from "../../dist/report/proposal-invariants.js";

const root = new URL("../../", import.meta.url);
const fixtureRoot = "fixtures/snapshot-three-workstreams/";

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

async function evaluationInputs() {
  const [proposal, manifest, evidence] = await Promise.all([
    readJson(`${fixtureRoot}agent-report-proposal.json`),
    readJson(`${fixtureRoot}fixture-manifest.json`),
    readJson(`${fixtureRoot}evidence.json`),
  ]);
  return { proposal, manifest, evidence };
}

test("the committed agent-authored proposal satisfies content invariants", async () => {
  const { proposal, manifest, evidence } = await evaluationInputs();
  assert.deepEqual(validateSnapshotProposal(proposal, manifest, evidence), {
    valid: true,
    errors: [],
  });
  assert.deepEqual(validateSnapshotProposal({ mode: "snapshot" }, manifest, evidence), {
    valid: false,
    errors: ["The agent report proposal has an invalid shape."],
  });
});

test("proposal evaluation is invariant-based rather than byte equality", async () => {
  const { proposal, manifest, evidence } = await evaluationInputs();
  const equivalent = structuredClone(proposal);
  equivalent.sections.reverse();
  equivalent.claims.reverse();
  equivalent.sections[0].summary = "Next-period intent remains explicit and evidence-linked.";

  assert.notDeepEqual(equivalent, proposal);
  assert.equal(validateSnapshotProposal(equivalent, manifest, evidence).valid, true);
});

test("consequential claims must map to real selected evidence", async () => {
  const { proposal, manifest, evidence } = await evaluationInputs();
  const unsupported = structuredClone(proposal);
  unsupported.claims.find(({ key }) => key === "replay-outcome").sourceIds = [];
  const missing = structuredClone(proposal);
  missing.claims.find(({ key }) => key === "replay-outcome").sourceIds = [
    "src_30000000-0000-4000-8000-000000000099",
  ];

  assert.match(
    validateSnapshotProposal(unsupported, manifest, evidence).errors.join("\n"),
    /consequential claim replay-outcome has no source/u,
  );
  assert.match(
    validateSnapshotProposal(missing, manifest, evidence).errors.join("\n"),
    /unknown source/u,
  );
});

test("all eleven fixture cases need a safe and semantically correct disposition", async () => {
  const { proposal, manifest, evidence } = await evaluationInputs();

  const missingCase = structuredClone(proposal);
  missingCase.caseHandling.pop();
  assert.match(
    validateSnapshotProposal(missingCase, manifest, evidence).errors.join("\n"),
    /case handling must cover exactly the fixture manifest/u,
  );

  const ambiguityIncluded = structuredClone(proposal);
  ambiguityIncluded.caseHandling.find(
    ({ category }) => category === "ambiguous-activity",
  ).disposition = "include";
  assert.match(
    validateSnapshotProposal(ambiguityIncluded, manifest, evidence).errors.join("\n"),
    /generate now must omit ambiguous activity/iu,
  );

  const historyDiscarded = structuredClone(proposal);
  historyDiscarded.caseHandling.find(
    ({ category }) => category === "duplicated-or-superseded-memory",
  ).disposition = "omit";
  assert.match(
    validateSnapshotProposal(historyDiscarded, manifest, evidence).errors.join("\n"),
    /preserve history as memory-only/u,
  );
});

test("untrusted HTML, credentials, and absolute paths cannot enter proposal fields", async () => {
  const { proposal, manifest, evidence } = await evaluationInputs();

  for (const unsafe of [
    "<script>fetch('https://attacker.example.invalid')</script>",
    "ghp_fixture000000000000000000000000000000",
    "/Users/casey/Northstar/private/reconciliation.env",
  ]) {
    const poisoned = structuredClone(proposal);
    poisoned.sections[0].summary = unsafe;
    assert.match(
      validateSnapshotProposal(poisoned, manifest, evidence).errors.join("\n"),
      /unsafe exportable content/u,
    );
  }
});
