import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveReportMode,
  resolveReportRequest,
  resolveReportingPeriod,
} from "../../dist/report/resolution.js";

test("mode resolution distinguishes a personal Snapshot from a purpose-bounded Deep Dive", () => {
  assert.deepEqual(
    resolveReportMode({ prompt: "Prepare my weekly update for my manager." }),
    { mode: "snapshot", source: "inferred", needsConfirmation: false },
  );
  assert.deepEqual(
    resolveReportMode({ prompt: "Create a Deep Dive for the architecture decision review." }),
    { mode: "deep-dive", source: "inferred", needsConfirmation: false },
  );
  assert.deepEqual(
    resolveReportMode({ prompt: "Turn these notes into a report." }),
    { mode: undefined, source: "unresolved", needsConfirmation: true },
  );
  assert.deepEqual(
    resolveReportMode({ prompt: "Turn these notes into a report.", generateNow: true }),
    { mode: "snapshot", source: "generate-now-default", needsConfirmation: false },
  );
});

test("reporting-period resolution supports the V1 cadences and exact custom dates", () => {
  const currentDate = "2026-08-26";

  assert.deepEqual(resolveReportingPeriod({ prompt: "weekly", currentDate }), {
    start: "2026-08-17",
    end: "2026-08-23",
    label: "Week of August 17, 2026",
    cadence: "weekly",
    source: "inferred",
  });
  assert.deepEqual(resolveReportingPeriod({ prompt: "biweekly update", currentDate }), {
    start: "2026-08-10",
    end: "2026-08-23",
    label: "Two weeks ending August 23, 2026",
    cadence: "biweekly",
    source: "inferred",
  });
  assert.deepEqual(resolveReportingPeriod({ prompt: "monthly recap", currentDate }), {
    start: "2026-08-01",
    end: "2026-08-26",
    label: "August 2026",
    cadence: "monthly",
    source: "inferred",
  });
  assert.deepEqual(resolveReportingPeriod({ prompt: "quarterly recap", currentDate }), {
    start: "2026-07-01",
    end: "2026-08-26",
    label: "Q3 2026",
    cadence: "quarterly",
    source: "inferred",
  });
  assert.deepEqual(
    resolveReportingPeriod({
      prompt: "custom update",
      currentDate,
      explicitPeriod: {
        start: "2026-08-17",
        end: "2026-08-23",
        label: "Week of August 17",
      },
    }),
    {
      start: "2026-08-17",
      end: "2026-08-23",
      label: "Week of August 17",
      cadence: "custom",
      source: "explicit",
    },
  );
  assert.deepEqual(resolveReportingPeriod({ prompt: "this week", currentDate }), {
    start: "2026-08-24",
    end: "2026-08-26",
    label: "Week of August 24, 2026",
    cadence: "weekly",
    source: "inferred",
  });
});

test("generate now resolves a usable Snapshot request without persistence setup", () => {
  const resolved = resolveReportRequest({
    prompt: "Generate now from the supplied notes.",
    currentDate: "2026-08-26",
    generateNow: true,
  });

  assert.equal(resolved.mode.mode, "snapshot");
  assert.equal(resolved.audience, "The creator's manager and collaborators");
  assert.match(resolved.purpose, /meaningful movement/u);
  assert.equal(resolved.reportingPeriod.cadence, "weekly");
  assert.equal(resolved.requiresPersistenceSetup, false);
});

test("invalid or reversed custom dates fail instead of being guessed", () => {
  assert.throws(
    () =>
      resolveReportingPeriod({
        prompt: "custom",
        currentDate: "2026-08-26",
        explicitPeriod: { start: "2026-08-23", end: "2026-08-17" },
      }),
    /start must not follow its end/u,
  );
  assert.throws(
    () => resolveReportingPeriod({ prompt: "weekly", currentDate: "2026-02-30" }),
    /valid calendar date/u,
  );
});
