import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { projectReportForExport } from "../../dist/contracts/export-projection.js";
import { validateReportModel } from "../../dist/contracts/report-semantics.js";

const root = new URL("../../", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

async function materializeNegativeFixture(relativePath) {
  const fixture = await readJson(relativePath);
  const document = await readJson(
    `fixtures/snapshot-three-workstreams/${fixture.basePath}`,
  );

  for (const mutation of fixture.mutations) {
    let target = document;
    const finalSegment = mutation.path.at(-1);
    for (const segment of mutation.path.slice(0, -1)) target = target[segment];
    target[finalSegment] = mutation.value;
  }

  return document;
}

function containsKey(value, forbiddenKey) {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, forbiddenKey));
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, item]) => key === forbiddenKey || containsKey(item, forbiddenKey),
  );
}

test("report semantics require resolvable evidence and one workspace boundary", async () => {
  const valid = await readJson(
    "fixtures/snapshot-three-workstreams/contracts/valid/report.json",
  );
  assert.deepEqual(validateReportModel(valid), { valid: true, errors: [] });

  const duplicate = structuredClone(valid);
  duplicate.evidence.sources.push(structuredClone(duplicate.evidence.sources[0]));
  assert.match(validateReportModel(duplicate).errors.join("\n"), /Duplicate source ID/u);

  for (const [file, expected] of [
    ["missing-evidence.json", /unknown source ID/u],
    ["cross-workspace-reference.json", /crosses workspace/u],
  ]) {
    const invalid = await materializeNegativeFixture(
      `fixtures/snapshot-three-workstreams/contracts/invalid/semantic/${file}`,
    );
    const result = validateReportModel(invalid);
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), expected);
  }
});

test("export projection structurally excludes creator-only source material", async () => {
  const source = await readJson(
    "fixtures/snapshot-three-workstreams/contracts/valid/report.json",
  );
  const projection = projectReportForExport(source);
  const serialized = JSON.stringify(projection);

  assert.equal(containsKey(projection, "creatorOnly"), false);
  assert.doesNotMatch(serialized, /\/Users\/casey/u);
  assert.doesNotMatch(serialized, /ghp_fixture/u);
  assert.doesNotMatch(serialized, /<script>/u);
  assert.equal(projection.evidence.sources[0].publicLabel, "Rollout planning notes");
  assert.notEqual(
    projection.evidence.sources[0].publicLabel,
    source.evidence.sources[0].creatorOnly.locators[0].value,
  );
});

test("export safety blocks path and credential sentinels in exportable fields without echoing them", async () => {
  for (const [file, expected] of [
    ["absolute-path-export.json", /absolute local path/u],
    ["secret-export.json", /suspected credential/u],
  ]) {
    const source = await materializeNegativeFixture(
      `fixtures/snapshot-three-workstreams/contracts/invalid/export/${file}`,
    );

    assert.throws(
      () => projectReportForExport(source),
      (error) => {
        assert.match(error.message, expected);
        assert.doesNotMatch(error.message, /Users\/casey|ghp_fixture/u);
        return true;
      },
    );
  }
});
