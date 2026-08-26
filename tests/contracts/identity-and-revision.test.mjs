import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ID_PREFIXES,
  createStableId,
  isStableId,
} from "../../dist/contracts/ids.js";
import { advanceRevision } from "../../dist/contracts/revisions.js";

const fixtureUrl = new URL(
  "../../fixtures/snapshot-three-workstreams/contracts/valid/report.json",
  import.meta.url,
);
const UUID = "123e4567-e89b-42d3-a456-426614174000";

test("stable IDs use a type prefix and a UUID created once", () => {
  for (const [kind, prefix] of Object.entries(ID_PREFIXES)) {
    let calls = 0;
    const id = createStableId(kind, () => {
      calls += 1;
      return UUID;
    });

    assert.equal(id, `${prefix}${UUID}`);
    assert.equal(calls, 1);
    assert.equal(isStableId(kind, id), true);
    assert.equal(isStableId(kind, `${prefix}not-a-uuid`), false);
  }
});

test("advancing a revision preserves every persisted ID and leaves the source immutable", async () => {
  const source = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const sourceBefore = structuredClone(source);
  const revised = advanceRevision(
    source,
    "2026-08-26T15:00:00.000Z",
    "Clarified the audience without changing identity.",
  );

  assert.deepEqual(source, sourceBefore);
  assert.notEqual(revised, source);
  assert.equal(revised.id, source.id);
  assert.equal(revised.revision, source.revision + 1);
  assert.deepEqual(
    revised.sections.map(({ id }) => id),
    source.sections.map(({ id }) => id),
  );
  assert.deepEqual(
    revised.components.map(({ id }) => id),
    source.components.map(({ id }) => id),
  );
  assert.deepEqual(
    revised.claims.map(({ id }) => id),
    source.claims.map(({ id }) => id),
  );
  assert.deepEqual(
    revised.evidence.sources.map(({ id }) => id),
    source.evidence.sources.map(({ id }) => id),
  );
  assert.equal(revised.design.id, source.design.id);
  assert.deepEqual(
    revised.visualizations.map(({ id }) => id),
    source.visualizations.map(({ id }) => id),
  );
  assert.equal(revised.revisionHistory.at(-1).revision, revised.revision);
  assert.equal(revised.revisionHistory.at(-1).createdAt, "2026-08-26T15:00:00.000Z");
});
