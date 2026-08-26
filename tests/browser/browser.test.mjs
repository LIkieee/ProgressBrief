/* global document, getComputedStyle, window */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

import { renderReport } from "../../dist/renderer/render-report.js";

const root = new URL("../../", import.meta.url);
const goldenUrl = new URL(
  "fixtures/snapshot-three-workstreams/golden-report-model.json",
  root,
);
const renderOptions = { renderedAt: "2026-08-26T16:30:00Z" };

async function renderedHtml() {
  const report = JSON.parse(await readFile(goldenUrl, "utf8"));
  return renderReport(report, renderOptions).html;
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

test("required presentation, reading, and mobile viewports have no overflow or clipped essential content", async () => {
  const browser = await chromium.launch();
  try {
    const html = await renderedHtml();
    for (const viewport of [
      { name: "presentation", width: 1440, height: 900, mode: "presentation" },
      { name: "reading", width: 1280, height: 800, mode: "reading" },
      { name: "mobile", width: 390, height: 844, mode: "reading" },
    ]) {
      const page = await browser.newPage({ viewport });
      const requests = [];
      page.on("request", (request) => requests.push(request.url()));
      await page.setContent(html, { waitUntil: "load" });
      await page.getByLabel(viewport.mode === "presentation" ? "Presentation view" : "Reading view").check();

      assert.deepEqual(await layoutState(page), { clipped: [], overflow: 0 }, viewport.name);
      assert.deepEqual(requests, [], `${viewport.name} must make no network requests`);
      assert.equal(await page.locator("main section").count(), 4);
      if (viewport.name === "mobile") {
        const chartLabelHeight = await page.locator(".chart-label").first().evaluate(
          (element) => element.getBoundingClientRect().height,
        );
        assert.ok(
          chartLabelHeight >= 10,
          `mobile chart labels must remain legible; rendered height was ${String(chartLabelHeight)}px`,
        );
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("the report remains complete without JavaScript and the CSP permits no script or network runtime", async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.setContent(await renderedHtml(), { waitUntil: "load" });

    const text = await page.locator("body").innerText();
    for (const phrase of [
      "Reconciliation pipeline",
      "18 minutes",
      "6 minutes",
      "Enterprise rollout",
      "data-retention review",
      "first cohort by Friday",
      "Validate alert thresholds",
    ]) {
      assert.match(text, new RegExp(phrase, "iu"));
    }
    assert.equal(await page.locator("svg").count(), 1);
    assert.equal(await page.locator("nav a").count(), 4);
    assert.deepEqual(requests, []);

    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    assert.match(csp, /default-src 'none'/u);
    assert.match(csp, /script-src 'none'/u);
    assert.match(csp, /connect-src 'none'/u);
    assert.match(csp, /form-action 'none'/u);
    await context.close();
  } finally {
    await browser.close();
  }
});

test("view controls, anchor navigation, disclosures, and the skip link are keyboard accessible", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(await renderedHtml());

    await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").getAttribute("class"), "skip-link");
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").getAttribute("id"), "view-reading");

    await page.keyboard.press("ArrowLeft");
    assert.equal(await page.locator("#view-presentation").isChecked(), true);
    assert.equal(await page.locator("[data-reading-context]").first().isHidden(), true);
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#view-reading").isChecked(), true);
    assert.equal(await page.locator("[data-reading-context]").first().isVisible(), true);

    await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").getAttribute("href"), "#orientation");
    for (let index = 0; index < 4; index += 1) await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").evaluate((element) => element.tagName), "SUMMARY");
    await page.keyboard.press("Enter");
    assert.equal(await page.locator(":focus").evaluate((element) => element.parentElement.open), true);
  } finally {
    await browser.close();
  }
});

test("the golden report has zero serious or critical automated accessibility violations", async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ bypassCSP: true });
    const page = await context.newPage();
    await page.setContent(await renderedHtml());
    const scan = await new AxeBuilder({ page }).analyze();
    const blocking = scan.violations.filter(({ impact }) =>
      impact === "serious" || impact === "critical",
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

test("A4 and US Letter print output is generated with essential content intact", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(await renderedHtml());
    await page.emulateMedia({ media: "print" });
    assert.deepEqual(await layoutState(page), { clipped: [], overflow: 0 });

    for (const format of ["A4", "Letter"]) {
      const pdf = await page.pdf({ format, printBackground: true });
      assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF");
      assert.ok(pdf.length > 10_000, `${format} output must contain the complete report`);
    }
  } finally {
    await browser.close();
  }
});
