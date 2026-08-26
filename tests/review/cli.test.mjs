import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { renderReport } from "../../dist/renderer/render-report.js";

const root = new URL("../../", import.meta.url);
const cliUrl = new URL("dist/cli/main.js", root);
const goldenUrl = new URL(
  "fixtures/snapshot-three-workstreams/golden-report-model.json",
  root,
);

function waitForReviewUrl(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`CLI did not start:\n${output}`)), 10_000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]{64}/u);
      if (match !== null) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`CLI exited before startup with ${String(code)}:\n${output}`));
    });
  });
}

test("the progressbrief CLI starts and stops the selected creator review session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "progressbrief-review-cli-"));
  const report = JSON.parse(await readFile(goldenUrl, "utf8"));
  const reportModelPath = join(directory, "source-model.json");
  const reportHtmlPath = join(directory, "clean-report.html");
  const queuePath = join(directory, "feedback-queue.json");
  await writeFile(reportModelPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(
    reportHtmlPath,
    renderReport(report, { renderedAt: "2026-08-26T18:00:00Z" }).html,
    "utf8",
  );

  const child = spawn(process.execPath, [
    cliUrl.pathname,
    "review",
    "--root", directory,
    "--report-model", reportModelPath,
    "--report-html", reportHtmlPath,
    "--queue", queuePath,
  ], { stdio: ["ignore", "pipe", "pipe"] });

  try {
    const url = await waitForReviewUrl(child);
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Creator review/u);
  } finally {
    child.kill("SIGTERM");
    const [code, signal] = await once(child, "exit");
    assert.equal(code, 0);
    assert.equal(signal, null);
  }
});
