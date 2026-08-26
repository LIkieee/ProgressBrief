import assert from "node:assert/strict";
import test from "node:test";

import {
  recallFromLibrary,
  searchRecallCandidates,
} from "../../dist/index.js";

import { setupRecallFixture } from "./helpers/recall-fixture.mjs";

test("Workspace, project, time, topic, and visibility filters narrow before ranking", async () => {
  const fixture = await setupRecallFixture("filters");
  const common = {
    libraryDirectory: fixture.libraryRoot,
    workspace: fixture.workspaces.northstar.id,
  };

  const topic = await searchRecallCandidates({
    ...common,
    query: "staging callback",
    project: [fixture.projects.reconciliation.slug],
    topic: ["load-testing"],
    visibility: ["internal"],
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
  });
  assert.deepEqual(topic.candidates.map(({ id }) => id), [fixture.records.replay.id]);

  const worklog = await searchRecallCandidates({
    ...common,
    query: "launched rollout cohort",
    project: [fixture.projects.delivery.id],
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
  });
  assert.deepEqual(worklog.candidates.map(({ id }) => id), [fixture.records.rollout.id]);

  const outsidePeriod = await searchRecallCandidates({
    ...common,
    query: "launched rollout cohort",
    project: [fixture.projects.delivery.id],
    dateFrom: "2026-08-01",
    visibility: ["internal"],
  });
  assert.deepEqual(outsidePeriod.candidates, []);

  const shareable = await searchRecallCandidates({
    ...common,
    query: "rollout checklist",
    visibility: ["shareable"],
  });
  assert.deepEqual(shareable.candidates.map(({ id }) => id), [fixture.records.shareable.id]);
});

test("an active agent can rerank lexical candidates without inventing or dropping grounding", async () => {
  const fixture = await setupRecallFixture("rerank");
  const options = {
    libraryDirectory: fixture.libraryRoot,
    workspace: fixture.workspaces.northstar.id,
    query: "staging reconciliation guidance",
  };
  const lexical = await searchRecallCandidates(options);
  const replayIndex = lexical.candidates.findIndex(({ id }) => id === fixture.records.replay.id);
  const workerIndex = lexical.candidates.findIndex(({ id }) => id === fixture.records.currentWorkerLimit.id);
  assert.notEqual(replayIndex, -1);
  assert.notEqual(workerIndex, -1);

  const reranked = await recallFromLibrary({
    ...options,
    rerankedIds: [fixture.records.currentWorkerLimit.id, fixture.records.replay.id],
  });
  assert.deepEqual(
    reranked.candidates.slice(0, 2).map(({ id }) => id),
    [fixture.records.currentWorkerLimit.id, fixture.records.replay.id],
  );
  assert.deepEqual(
    new Set(reranked.candidates.map(({ id }) => id)),
    new Set(lexical.candidates.map(({ id }) => id)),
  );
  await assert.rejects(
    recallFromLibrary({ ...options, rerankedIds: ["knw_00000000-0000-4000-8000-000000000099"] }),
    /not a retrieved Recall candidate/u,
  );
});
