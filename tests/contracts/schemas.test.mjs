import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import {
  SCHEMA_NAMES,
  validateDocument,
} from "../../dist/contracts/schema-validator.js";

const root = new URL("../../", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

test("all eight required persistent contracts use JSON Schema 2020-12 and a versioned ID", async () => {
  assert.deepEqual(SCHEMA_NAMES, [
    "design",
    "evidence",
    "feedback-queue",
    "knowledge-note",
    "report",
    "visualization",
    "worklog-entry",
    "workspace",
  ]);

  for (const schemaName of SCHEMA_NAMES) {
    const schema = await readJson(`schemas/${schemaName}.schema.json`);
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.match(schema.$id, /\/schemas\/v1\//u);
  }
});

test("every committed valid schema fixture validates", async () => {
  const directory = new URL("fixtures/snapshot-three-workstreams/contracts/valid/", root);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));

  assert.deepEqual(
    files.toSorted(),
    SCHEMA_NAMES.map((name) => `${name}.json`).toSorted(),
  );

  for (const schemaName of SCHEMA_NAMES) {
    const document = await readJson(
      `fixtures/snapshot-three-workstreams/contracts/valid/${schemaName}.json`,
    );
    const result = validateDocument(schemaName, document);
    assert.equal(result.valid, true, `${schemaName}: ${result.errors.join("; ")}`);
  }
});

test("committed malformed schema fixtures fail for the declared reason", async () => {
  const cases = [
    ["report", "malformed-report-id.json", "/id"],
    ["workspace", "invalid-workspace-visibility.json", "/defaultVisibility"],
    ["feedback-queue", "invalid-feedback-target.json", "/items/0/target/componentId"],
    ["knowledge-note", "unexpected-property.json", "additional properties"],
  ];

  for (const [schemaName, file, expectedError] of cases) {
    const document = await readJson(
      `fixtures/snapshot-three-workstreams/contracts/invalid/schema/${file}`,
    );
    const result = validateDocument(schemaName, document);
    assert.equal(result.valid, false, `${file} must not validate`);
    assert.match(result.errors.join("\n"), new RegExp(expectedError, "iu"));
  }
});
