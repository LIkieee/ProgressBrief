import assert from "node:assert/strict";
import test from "node:test";

import { createConfirmationPlan } from "../../dist/report/confirmation.js";
import {
  DEFAULT_SNAPSHOT_STRUCTURE,
  resolveStructure,
} from "../../dist/report/structure.js";

const custom = [
  { key: "headline", role: "orientation", title: "Headline" },
  { key: "decisions", role: "attention", title: "Decisions" },
];
const remembered = [
  { key: "movement", role: "movement", title: "Movement" },
  { key: "forward", role: "forward-view", title: "Forward" },
];

test("structure resolution honors user, remembered, then proposed precedence", () => {
  assert.deepEqual(
    resolveStructure({ mode: "snapshot", explicit: custom, remembered, proposed: DEFAULT_SNAPSHOT_STRUCTURE }),
    { sections: custom, source: "user", needsConfirmation: false },
  );
  assert.deepEqual(
    resolveStructure({ mode: "snapshot", remembered, proposed: DEFAULT_SNAPSHOT_STRUCTURE }),
    { sections: remembered, source: "remembered", needsConfirmation: false },
  );
  assert.deepEqual(
    resolveStructure({ mode: "snapshot", proposed: custom }),
    { sections: custom, source: "agent-proposal", needsConfirmation: true },
  );
  assert.deepEqual(resolveStructure({ mode: "snapshot" }), {
    sections: DEFAULT_SNAPSHOT_STRUCTURE,
    source: "default-proposal",
    needsConfirmation: true,
  });
  assert.throws(
    () => resolveStructure({ mode: "deep-dive" }),
    /requires an evidence-led structure proposal/u,
  );
});

test("confirmation asks one concise material question at a time and never exceeds five", () => {
  const plan = createConfirmationPlan({
    modeNeedsConfirmation: true,
    audienceNeedsConfirmation: true,
    periodNeedsConfirmation: true,
    structureNeedsConfirmation: true,
    ambiguousEvidence: ["permissions-cleanup", "release-date"],
  });

  assert.equal(plan.stoppedByGenerateNow, false);
  assert.ok(plan.questions.length <= 5);
  assert.equal(plan.nextQuestion, plan.questions[0]);
  assert.equal(new Set(plan.questions.map(({ id }) => id)).size, plan.questions.length);
  for (const question of plan.questions) {
    assert.ok(question.prompt.length <= 180);
    assert.ok(question.options.length >= 2 && question.options.length <= 3);
    assert.ok(question.options.includes(question.recommendation));
  }
});

test("generate now ends the interview and omits unresolved material", () => {
  assert.deepEqual(
    createConfirmationPlan({
      generateNow: true,
      modeNeedsConfirmation: true,
      structureNeedsConfirmation: true,
      ambiguousEvidence: ["permissions-cleanup"],
    }),
    {
      questions: [],
      nextQuestion: undefined,
      stoppedByGenerateNow: true,
      unresolvedEvidenceDisposition: "omit",
    },
  );
});
