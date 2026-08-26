import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateDocument } from "../../dist/contracts/schema-validator.js";
import {
  FeedbackQueueStore,
  applyInlineEditFeedback,
  componentContentHash,
  createFeedbackTarget,
  reconcileFeedbackQueue,
} from "../../dist/review/feedback.js";
import { createFeedbackInvocations } from "../../dist/review/invocations.js";

const root = new URL("../../", import.meta.url);
const goldenUrl = new URL(
  "fixtures/snapshot-three-workstreams/golden-report-model.json",
  root,
);

async function golden() {
  return JSON.parse(await readFile(goldenUrl, "utf8"));
}

function sequentialUuidFactory() {
  let sequence = 1;
  return () => {
    const tail = sequence.toString(16).padStart(12, "0");
    sequence += 1;
    return `a0000000-0000-4000-8000-${tail}`;
  };
}

test("stable component and selected-text targets persist atomically in a versioned queue", async () => {
  const report = await golden();
  const component = report.components[1];
  const directory = await mkdtemp(join(tmpdir(), "progressbrief-feedback-"));
  const queuePath = join(directory, "feedback-queue.json");
  const target = createFeedbackTarget(report, component.id, "18 minutes to 6 minutes");
  const uuidFactory = sequentialUuidFactory();
  let tick = 0;
  const store = new FeedbackQueueStore({
    queuePath,
    reportId: report.id,
    now: () => `2026-08-26T18:00:0${String(tick++)}Z`,
    uuidFactory,
  });

  assert.equal(target.componentId, component.id);
  assert.equal(target.selectedText, "18 minutes to 6 minutes");
  assert.equal(target.contentHash, componentContentHash(report, component.id));
  assert.match(target.contentHash, /^[0-9a-f]{64}$/u);

  await Promise.all([
    store.append(report, {
      kind: "annotation",
      target,
      request: "Keep the sample size next to this comparison.",
    }),
    store.append(report, {
      kind: "inline-edit",
      target,
      request: "Use a more compact duration phrase.",
      replacementText: "18 to 6 minutes",
    }),
  ]);

  const queue = await store.read();
  assert.ok(queue);
  assert.equal(queue.schemaVersion, "1.0.0");
  assert.equal(queue.reportId, report.id);
  assert.equal(queue.reportRevision, report.revision);
  assert.equal(queue.queueVersion, 2);
  assert.deepEqual(queue.items.map(({ kind }) => kind), ["annotation", "inline-edit"]);
  assert.deepEqual(queue.items.map(({ status }) => status), ["pending", "pending"]);
  assert.match(queue.id, /^fbq_/u);
  assert.match(queue.items[0].id, /^fbk_/u);
  assert.equal(validateDocument("feedback-queue", queue).valid, true);
  assert.deepEqual(JSON.parse(await readFile(queuePath, "utf8")), queue);
  assert.deepEqual(await readdir(directory), ["feedback-queue.json"]);

  assert.throws(
    () => createFeedbackTarget(report, component.id, "text not present in this component"),
    /selected text is not present/u,
  );
  await assert.rejects(
    store.append(report, {
      kind: "inline-edit",
      target: createFeedbackTarget(report, component.id),
      request: "Replace it.",
      replacementText: "New text",
    }),
    /selected text/u,
  );

  const revised = applyInlineEditFeedback(
    report,
    queue.items[1],
    "2026-08-26T18:05:00Z",
  );
  assert.match(revised.components[1].body, /18 to 6 minutes/u);
  assert.doesNotMatch(report.components[1].body, /18 to 6 minutes/u);
  assert.equal(revised.id, report.id);
  assert.equal(revised.revision, report.revision + 1);
  assert.deepEqual(
    revised.components.map(({ id }) => id),
    report.components.map(({ id }) => id),
  );
  const appliedQueue = await store.updateItemStatus(queue.items[1].id, "applied");
  assert.equal(appliedQueue.items[1].status, "applied");
  assert.equal(appliedQueue.queueVersion, 3);
});

test("changed component content produces an explicit conflict instead of an overwrite", async () => {
  const report = await golden();
  const component = report.components[1];
  const target = createFeedbackTarget(report, component.id, "18 minutes to 6 minutes");
  const queue = {
    schemaVersion: "1.0.0",
    id: "fbq_a0000000-0000-4000-8000-000000000001",
    reportId: report.id,
    reportRevision: report.revision,
    queueVersion: 1,
    updatedAt: "2026-08-26T18:00:00Z",
    items: [
      {
        id: "fbk_b0000000-0000-4000-8000-000000000001",
        kind: "inline-edit",
        target,
        request: "Use a compact duration phrase.",
        replacementText: "18 to 6 minutes",
        status: "pending",
        createdAt: "2026-08-26T18:00:00Z",
      },
    ],
  };
  const changed = structuredClone(report);
  changed.components[1].body = "The benchmark was rerun with a different dataset.";

  const reconciled = reconcileFeedbackQueue(queue, changed, "2026-08-26T18:05:00Z");

  assert.equal(queue.items[0].status, "pending", "the source queue must stay untouched");
  assert.equal(reconciled.items[0].status, "conflict");
  assert.equal(reconciled.queueVersion, 2);
  assert.equal(reconciled.updatedAt, "2026-08-26T18:05:00Z");
  assert.equal(validateDocument("feedback-queue", reconciled).valid, true);
  assert.throws(
    () => applyInlineEditFeedback(changed, queue.items[0], "2026-08-26T18:05:00Z"),
    /target conflict/u,
  );

  const directory = await mkdtemp(join(tmpdir(), "progressbrief-conflict-"));
  const queuePath = join(directory, "feedback-queue.json");
  await writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  const store = new FeedbackQueueStore({
    queuePath,
    reportId: report.id,
    now: () => "2026-08-26T18:05:00Z",
  });
  const persisted = await store.reconcile(changed);
  assert.equal(persisted.items[0].status, "conflict");
  assert.deepEqual(JSON.parse(await readFile(queuePath, "utf8")), persisted);
});

test("handoff text is exact, host-specific, and safe for paths with spaces", () => {
  const invocations = createFeedbackInvocations({
    feedbackQueuePath: "/tmp/Progress Brief/feedback queue.json",
    reportModelPath: "/tmp/Progress Brief/source model.json",
    reportHtmlPath: "/tmp/Progress Brief/clean report.html",
  });

  assert.equal(
    invocations.codex,
    '$progressbrief-report Apply the pending feedback queue at "/tmp/Progress Brief/feedback queue.json" to the report model at "/tmp/Progress Brief/source model.json" and refresh the clean HTML at "/tmp/Progress Brief/clean report.html".',
  );
  assert.equal(
    invocations.claude,
    '/progressbrief-report Apply the pending feedback queue at "/tmp/Progress Brief/feedback queue.json" to the report model at "/tmp/Progress Brief/source model.json" and refresh the clean HTML at "/tmp/Progress Brief/clean report.html".',
  );
});
