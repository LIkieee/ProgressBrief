/* global document, MouseEvent, NodeFilter, window */

import assert from "node:assert/strict";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

import { renderReport } from "../../dist/renderer/render-report.js";
import { createFeedbackTarget } from "../../dist/review/feedback.js";
import { startReviewServer } from "../../dist/review/server.js";

const root = new URL("../../", import.meta.url);
const goldenUrl = new URL(
  "fixtures/snapshot-three-workstreams/golden-report-model.json",
  root,
);
const renderOptions = { renderedAt: "2026-08-26T18:00:00Z" };

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "progressbrief-review-"));
  const report = JSON.parse(await readFile(goldenUrl, "utf8"));
  const reportModelPath = join(directory, "source-model.json");
  const reportHtmlPath = join(directory, "clean-report.html");
  const feedbackQueuePath = join(directory, "feedback-queue.json");
  await writeFile(reportModelPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(reportHtmlPath, renderReport(report, renderOptions).html, "utf8");
  return { directory, feedbackQueuePath, report, reportHtmlPath, reportModelPath };
}

function rawRequest({ port, path, host, origin }) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: "127.0.0.1",
      port,
      path,
      headers: {
        Host: host,
        ...(origin === undefined ? {} : { Origin: origin }),
      },
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
    request.end();
  });
}

test("the server binds to a random loopback port and rejects forged authority or filesystem access", async () => {
  const setup = await fixture();
  const review = await startReviewServer({
    allowedRoot: setup.directory,
    reportModelPath: setup.reportModelPath,
    reportHtmlPath: setup.reportHtmlPath,
    feedbackQueuePath: setup.feedbackQueuePath,
  });
  try {
    assert.equal(review.hostname, "127.0.0.1");
    assert.ok(review.port > 0);
    assert.match(review.token, /^[0-9a-f]{64}$/u);
    assert.equal(review.origin, `http://127.0.0.1:${String(review.port)}`);

    const wrapper = await fetch(review.url);
    assert.equal(wrapper.status, 200);
    const wrapperHtml = await wrapper.text();
    assert.match(wrapperHtml, /Creator review/u);
    assert.match(wrapperHtml, /\$progressbrief-report/u);
    assert.match(wrapperHtml, /\/progressbrief-report/u);

    const reportResponse = await fetch(
      `${review.origin}/reports/${setup.report.id}?token=${review.token}`,
    );
    const servedReport = await reportResponse.text();
    assert.equal(reportResponse.status, 200);
    assert.equal(servedReport, await readFile(setup.reportHtmlPath, "utf8"));
    assert.doesNotMatch(servedReport, /reviewToken|feedback-queue|EventSource|Creator review/u);
    assert.doesNotMatch(servedReport, /127\.0\.0\.1|localhost|\$progressbrief-report|\/progressbrief-report/u);
    assert.equal(servedReport.includes(review.token), false);
    assert.equal(servedReport.includes(setup.feedbackQueuePath), false);

    assert.equal((await fetch(`${review.origin}/?token=wrong`)).status, 401);
    assert.equal(
      await rawRequest({
        port: review.port,
        path: `/?token=${review.token}`,
        host: "attacker.example.invalid",
      }),
      403,
    );
    assert.equal(
      await rawRequest({
        port: review.port,
        path: `/?token=${review.token}`,
        host: `127.0.0.1:${String(review.port)}`,
        origin: "https://attacker.example.invalid",
      }),
      403,
    );
    assert.equal(
      (await fetch(`${review.origin}/files/${encodeURIComponent("../../package.json")}?token=${review.token}`)).status,
      404,
    );
    assert.equal(
      (await fetch(`${review.origin}/reports/rpt_40000000-0000-4000-8000-000000000099?token=${review.token}`)).status,
      404,
    );

    const badOrigin = await fetch(
      `${review.origin}/api/reports/${setup.report.id}/feedback?token=${review.token}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://attacker.example.invalid" },
        body: JSON.stringify({ reportId: setup.report.id }),
      },
    );
    assert.equal(badOrigin.status, 403);
  } finally {
    await review.close();
  }

  const outside = await mkdtemp(join(tmpdir(), "progressbrief-review-outside-"));
  const outsideHtml = join(outside, "outside.html");
  await writeFile(outsideHtml, "<!doctype html><title>outside</title>", "utf8");
  await assert.rejects(
    startReviewServer({
      allowedRoot: setup.directory,
      reportModelPath: setup.reportModelPath,
      reportHtmlPath: outsideHtml,
      feedbackQueuePath: setup.feedbackQueuePath,
    }),
    /outside the allowed review root/u,
  );

  const symlinkPath = join(setup.directory, "escaped-report.html");
  await symlink(outsideHtml, symlinkPath);
  await assert.rejects(
    startReviewServer({
      allowedRoot: setup.directory,
      reportModelPath: setup.reportModelPath,
      reportHtmlPath: symlinkPath,
      feedbackQueuePath: setup.feedbackQueuePath,
    }),
    /outside the allowed review root/u,
  );
});

test("the creator can queue annotations and inline edits, copy a host handoff, and receive live reload", async () => {
  const setup = await fixture();
  const review = await startReviewServer({
    allowedRoot: setup.directory,
    reportModelPath: setup.reportModelPath,
    reportHtmlPath: setup.reportHtmlPath,
    feedbackQueuePath: setup.feedbackQueuePath,
  });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: review.origin,
    });
    const page = await context.newPage();
    await page.goto(review.url);
    await assert.doesNotReject(page.locator("#live-status").waitFor({ state: "visible" }));
    await page.waitForFunction(() => document.querySelector("#live-status")?.textContent?.includes("connected"));

    const frame = page.frameLocator("#report-frame");
    const targetComponent = setup.report.components[1];
    const paragraph = frame.locator(`[data-component-id="${targetComponent.id}"] p`);
    await paragraph.evaluate((element) => {
      const phrase = "18 minutes to 6 minutes";
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node !== null && !node.textContent.includes(phrase)) node = walker.nextNode();
      if (node === null) throw new Error("selection phrase not found");
      const start = node.textContent.indexOf(phrase);
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + phrase.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await page.getByLabel("Revision request").fill("Keep the sample size beside the duration.");
    await page.getByRole("button", { name: "Queue annotation" }).click();
    await page.getByText("Queued annotation").waitFor();

    await page.getByLabel("Revision request").fill("Use a compact duration phrase.");
    await page.getByLabel("Replacement text").fill("18 to 6 minutes");
    await page.getByRole("button", { name: "Queue inline edit" }).click();
    await page.getByText("Queued inline edit").waitFor();

    const queue = JSON.parse(await readFile(setup.feedbackQueuePath, "utf8"));
    assert.deepEqual(queue.items.map(({ kind }) => kind), ["annotation", "inline-edit"]);
    assert.equal(queue.items[1].replacementText, "18 to 6 minutes");
    assert.deepEqual(queue.items.map(({ target }) => target), [
      createFeedbackTarget(setup.report, targetComponent.id, "18 minutes to 6 minutes"),
      createFeedbackTarget(setup.report, targetComponent.id, "18 minutes to 6 minutes"),
    ]);

    await page.getByLabel("Agent host").selectOption("claude");
    const expectedInvocation = await page.locator("#claude-invocation").innerText();
    await page.getByRole("button", { name: "Copy invocation" }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expectedInvocation);
    assert.match(expectedInvocation, /^\/progressbrief-report/u);

    await page.getByLabel("Revision request").focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").getAttribute("id"), "replacement-text");
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").getAttribute("id"), "queue-annotation");
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").getAttribute("id"), "queue-inline");
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").getAttribute("id"), "agent-host");
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").getAttribute("id"), "copy-invocation");

    const accessibility = await new AxeBuilder({ page }).analyze();
    assert.deepEqual(
      accessibility.violations
        .filter(({ impact }) => impact === "serious" || impact === "critical")
        .map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length })),
      [],
    );

    const originalHtml = await readFile(setup.reportHtmlPath, "utf8");
    await writeFile(
      setup.reportHtmlPath,
      originalHtml.replace("Reconciliation pipeline performance", "LIVE RELOAD APPLIED"),
      "utf8",
    );
    await frame.getByText("LIVE RELOAD APPLIED").waitFor({ timeout: 10_000 });
    assert.match(await page.locator("#live-status").innerText(), /connected/u);

    await context.close();
  } finally {
    await browser.close();
    await review.close();
  }
});

test("the review endpoint validates report identity and stale target hashes", async () => {
  const setup = await fixture();
  const review = await startReviewServer({
    allowedRoot: setup.directory,
    reportModelPath: setup.reportModelPath,
    reportHtmlPath: setup.reportHtmlPath,
    feedbackQueuePath: setup.feedbackQueuePath,
  });
  try {
    const target = createFeedbackTarget(
      setup.report,
      setup.report.components[1].id,
      "18 minutes to 6 minutes",
    );
    const response = await fetch(
      `${review.origin}/api/reports/${setup.report.id}/feedback?token=${review.token}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: review.origin },
        body: JSON.stringify({
          reportId: "rpt_40000000-0000-4000-8000-000000000099",
          kind: "annotation",
          target,
          request: "This report ID is forged.",
        }),
      },
    );
    assert.equal(response.status, 409);

    const staleTarget = { ...target, contentHash: "0".repeat(64) };
    const stale = await fetch(
      `${review.origin}/api/reports/${setup.report.id}/feedback?token=${review.token}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: review.origin },
        body: JSON.stringify({
          reportId: setup.report.id,
          kind: "inline-edit",
          target: staleTarget,
          request: "Replace stale text.",
          replacementText: "new text",
        }),
      },
    );
    assert.equal(stale.status, 201);
    const queue = await stale.json();
    assert.equal(queue.items[0].status, "conflict");
  } finally {
    await review.close();
  }
});
