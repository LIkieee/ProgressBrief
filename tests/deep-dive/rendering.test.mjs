/* global document, getComputedStyle, window */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

import { renderReport } from "../../dist/renderer/render-report.js";

const root = new URL("../../", import.meta.url);
const renderOptions = { renderedAt: "2026-08-26T20:30:00Z" };
const snapshotHash = "3c1188e833955ba7cb790df05bd369ba357d6c02cbd5a720161e94c62caea908";

async function fixture(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function layoutState(page) {
  return page.evaluate(() => {
    const roots = [document.documentElement, document.body];
    const overflow = Math.max(
      ...roots.map((element) => element.scrollWidth - element.clientWidth),
    );
    const clipped = [...document.querySelectorAll("[data-essential]")]
      .filter((element) => {
        const rectangle = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (rectangle.width === 0 || rectangle.height === 0) return false;
        return (
          rectangle.left < -1 ||
          rectangle.right > window.innerWidth + 1 ||
          (style.overflowX !== "visible" && element.scrollWidth - element.clientWidth > 1) ||
          (style.overflowY === "hidden" && element.scrollHeight - element.clientHeight > 1)
        );
      })
      .map((element) => element.getAttribute("data-component-id") ?? element.tagName);
    return { clipped, overflow };
  });
}

test("the shared renderer produces a deeper two-visual composition without perturbing Snapshot output", async () => {
  const deepDive = await fixture("fixtures/deep-dive-reconciliation/golden-report-model.json");
  const snapshot = await fixture(
    "fixtures/snapshot-three-workstreams/golden-report-model.json",
  );
  const first = renderReport(deepDive, renderOptions);
  const second = renderReport(structuredClone(deepDive), renderOptions);

  assert.deepEqual(second, first);
  assert.equal(hash(renderReport(snapshot, renderOptions).html), snapshotHash);
  assert.match(first.html, /Deep Dive/u);
  assert.equal(deepDive.visualizations.length, 2);
  assert.deepEqual(
    deepDive.visualizations.map(({ family }) => family),
    ["timeline", "quantitative-chart"],
  );
  assert.ok(
    deepDive.claims.some(({ sourceIds }) => sourceIds.length === 3),
    "at least one consequential result must be corroborated at greater source depth",
  );
});

test("reading view places source labels beside each section claim while presentation stays concise", async () => {
  const deepDive = await fixture("fixtures/deep-dive-reconciliation/golden-report-model.json");
  const html = renderReport(deepDive, renderOptions).html;
  const browser = await chromium.launch();
  try {
    for (const viewport of [
      { name: "presentation", width: 1440, height: 900 },
      { name: "reading", width: 1280, height: 800 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      const requests = [];
      page.on("request", (request) => requests.push(request.url()));
      await page.setContent(html, { waitUntil: "load" });
      assert.deepEqual(await layoutState(page), { clipped: [], overflow: 0 }, viewport.name);
      assert.deepEqual(requests, [], `${viewport.name} must make no network requests`);

      await page.getByLabel("Presentation view").check();
      assert.equal(await page.locator("[data-deep-dive-evidence]").count(), 4);
      assert.equal(await page.locator("[data-deep-dive-evidence]").first().isHidden(), true);
      assert.match(await page.locator("#the-problem-to-solve").innerText(), /18[- ]minute/u);

      await page.getByLabel("Reading view").check();
      const localEvidence = page.locator("#the-problem-to-solve [data-deep-dive-evidence]");
      assert.equal(await localEvidence.isVisible(), true);
      assert.equal(await localEvidence.getAttribute("open"), "");
      assert.match(await localEvidence.innerText(), /Replay benchmark dashboard/u);
      assert.match(await localEvidence.innerText(), /Reconciliation checkpoint pull request/u);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("the Deep Dive reading composition has no serious or critical accessibility violations", async () => {
  const deepDive = await fixture("fixtures/deep-dive-reconciliation/golden-report-model.json");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ bypassCSP: true });
    const page = await context.newPage();
    await page.setContent(renderReport(deepDive, renderOptions).html);
    const scan = await new AxeBuilder({ page }).analyze();
    const blocking = scan.violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical",
    );
    assert.deepEqual(
      blocking.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length })),
      [],
    );
    await context.close();
  } finally {
    await browser.close();
  }
});
