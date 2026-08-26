import { escapeAttribute, escapeHtml } from "../renderer/html.js";
import type { FeedbackInvocations } from "./invocations.js";

export interface ReviewPageConfig {
  reportId: string;
  token: string;
  reportUrl: string;
  feedbackUrl: string;
  eventsUrl: string;
  componentHashes: Record<string, string>;
  invocations: FeedbackInvocations;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function renderReviewPage(config: ReviewPageConfig, nonce: string): string {
  const serialized = safeJson(config);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Creator review · ProgressBrief</title>
<style nonce="${escapeAttribute(nonce)}">
:root { color-scheme: light; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --ink: #18201f; --muted: #5b6966; --line: #c9d3d1; --accent: #126b62; --panel: #f3f7f6; }
* { box-sizing: border-box; }
body { margin: 0; color: var(--ink); background: #fff; }
.review-shell { display: grid; grid-template-columns: minmax(0, 1fr) minmax(20rem, 26rem); min-height: 100vh; }
.report-stage { min-width: 0; background: #e7eceb; }
#report-frame { display: block; width: 100%; height: 100vh; border: 0; background: #fff; }
.review-panel { height: 100vh; overflow: auto; padding: 1.25rem; border-left: 1px solid var(--line); background: var(--panel); }
.eyebrow { margin: 0; color: var(--accent); font-size: .72rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
h1 { margin: .3rem 0 .45rem; font-size: 1.65rem; line-height: 1.05; }
.intro, .status, .hint { color: var(--muted); }
.status { min-height: 1.5rem; font-size: .88rem; }
.target { padding: .75rem; border: 1px solid var(--line); background: #fff; overflow-wrap: anywhere; }
label { display: grid; gap: .35rem; margin-top: .9rem; font-size: .86rem; font-weight: 700; }
textarea, select { width: 100%; padding: .62rem; border: 1px solid #8b9996; border-radius: .25rem; background: #fff; color: var(--ink); font: inherit; }
textarea { min-height: 5rem; resize: vertical; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: .55rem; margin-top: .8rem; }
button { padding: .65rem .7rem; border: 1px solid var(--accent); border-radius: .25rem; background: var(--accent); color: #fff; font: inherit; font-weight: 750; cursor: pointer; }
button.secondary { background: #fff; color: var(--accent); }
button:focus-visible, textarea:focus-visible, select:focus-visible { outline: 3px solid #e29b32; outline-offset: 2px; }
.handoff { margin-top: 1.4rem; padding-top: 1rem; border-top: 1px solid var(--line); }
.handoff h2 { margin: 0 0 .4rem; font-size: 1rem; }
code { display: block; margin: .55rem 0; padding: .7rem; border: 1px solid var(--line); background: #fff; font-size: .72rem; line-height: 1.4; overflow-wrap: anywhere; white-space: pre-wrap; }
@media (max-width: 850px) { .review-shell { grid-template-columns: 1fr; } #report-frame { height: 65vh; } .review-panel { height: auto; border-top: 1px solid var(--line); border-left: 0; } }
</style>
</head>
<body>
<main class="review-shell">
<section class="report-stage" aria-label="Report under review">
<iframe id="report-frame" title="ProgressBrief report under review" src="${escapeAttribute(config.reportUrl)}"></iframe>
</section>
<aside class="review-panel" aria-labelledby="review-title">
<p class="eyebrow">Creator only</p>
<h1 id="review-title">Creator review</h1>
<p class="intro">Select report text or click a component, then queue a revision request. The clean report remains unchanged until the active agent applies the queue.</p>
<p id="live-status" class="status" aria-live="polite">Connecting live reload…</p>
<p id="selected-target" class="target">No component selected.</p>
<label for="revision-request">Revision request<textarea id="revision-request" maxlength="4000" required></textarea></label>
<label for="replacement-text">Replacement text<textarea id="replacement-text" maxlength="10000" aria-describedby="replacement-hint"></textarea></label>
<p id="replacement-hint" class="hint">Required only for an inline text correction.</p>
<div class="actions"><button id="queue-annotation" type="button">Queue annotation</button><button id="queue-inline" class="secondary" type="button">Queue inline edit</button></div>
<p id="queue-status" class="status" aria-live="polite"></p>
<section class="handoff" aria-labelledby="handoff-title">
<h2 id="handoff-title">Send to agent</h2>
<p class="hint">The durable queue is the handoff. Copy the invocation for the active host and run it in that session.</p>
<label for="agent-host">Agent host<select id="agent-host"><option value="codex">Codex</option><option value="claude">Claude Code</option></select></label>
<code id="codex-invocation">${escapeHtml(config.invocations.codex)}</code>
<code id="claude-invocation">${escapeHtml(config.invocations.claude)}</code>
<button id="copy-invocation" type="button">Copy invocation</button>
<p id="copy-status" class="status" aria-live="polite"></p>
</section>
</aside>
</main>
<script nonce="${escapeAttribute(nonce)}">
const config = ${serialized};
const frame = document.querySelector("#report-frame");
const selectedTarget = document.querySelector("#selected-target");
const requestField = document.querySelector("#revision-request");
const replacementField = document.querySelector("#replacement-text");
const queueStatus = document.querySelector("#queue-status");
const liveStatus = document.querySelector("#live-status");
let target;
let highlighted;

function selectComponent(event) {
  const frameWindow = frame.contentWindow;
  const selection = frameWindow?.getSelection();
  const selectedText = selection?.toString().trim() || undefined;
  const anchor = selection?.anchorNode;
  const anchorElement = anchor?.nodeType === 3 ? anchor.parentElement : anchor;
  const eventElement = event.target?.closest?.("[data-component-id]");
  const component = anchorElement?.closest?.("[data-component-id]") ?? eventElement;
  const componentId = component?.getAttribute("data-component-id");
  const contentHash = componentId === null || componentId === undefined
    ? undefined
    : config.componentHashes[componentId];
  if (componentId === null || componentId === undefined || contentHash === undefined) return;
  highlighted?.style.removeProperty("outline");
  highlighted?.style.removeProperty("outline-offset");
  highlighted = component;
  highlighted.style.outline = "3px solid #126b62";
  highlighted.style.outlineOffset = "4px";
  target = { componentId, ...(selectedText === undefined ? {} : { selectedText }), contentHash };
  selectedTarget.textContent = selectedText === undefined
    ? "Selected component " + componentId + "."
    : "Selected “" + selectedText + "” in " + componentId + ".";
}

function attachReportListeners() {
  const reportDocument = frame.contentDocument;
  reportDocument?.addEventListener("mouseup", selectComponent);
  reportDocument?.addEventListener("click", selectComponent);
}
frame.addEventListener("load", attachReportListeners);

async function queueFeedback(kind) {
  if (target === undefined) {
    queueStatus.textContent = "Select a report component first.";
    return;
  }
  const request = requestField.value;
  if (request.trim().length === 0) {
    queueStatus.textContent = "Add a revision request first.";
    return;
  }
  const replacementText = replacementField.value;
  if (kind === "inline-edit" && (target.selectedText === undefined || replacementText.length === 0)) {
    queueStatus.textContent = "Select text and add replacement text for an inline edit.";
    return;
  }
  const response = await fetch(config.feedbackUrl, {
    method: "POST",
    headers: { "authorization": "Bearer " + config.token, "content-type": "application/json" },
    body: JSON.stringify({
      reportId: config.reportId,
      kind,
      target,
      request,
      ...(kind === "inline-edit" ? { replacementText } : {}),
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    queueStatus.textContent = result.error ?? "The feedback operation could not be queued.";
    return;
  }
  const item = result.items.at(-1);
  queueStatus.textContent = "Queued " + (kind === "inline-edit" ? "inline edit" : "annotation") + " (" + item.status + ").";
  requestField.value = "";
  if (kind === "inline-edit") replacementField.value = "";
}

document.querySelector("#queue-annotation").addEventListener("click", () => void queueFeedback("annotation"));
document.querySelector("#queue-inline").addEventListener("click", () => void queueFeedback("inline-edit"));
document.querySelector("#copy-invocation").addEventListener("click", async () => {
  const host = document.querySelector("#agent-host").value;
  const copyStatus = document.querySelector("#copy-status");
  try {
    await navigator.clipboard.writeText(config.invocations[host]);
    copyStatus.textContent = "Copied the " + (host === "codex" ? "Codex" : "Claude Code") + " invocation.";
  } catch {
    copyStatus.textContent = "Clipboard access was unavailable. Select the displayed invocation manually.";
  }
});

const events = new EventSource(config.eventsUrl);
events.onopen = () => { liveStatus.textContent = "Live reload connected."; };
events.onerror = () => { liveStatus.textContent = "Live reload reconnecting…"; };
events.addEventListener("reload", () => window.location.reload());
</script>
</body>
</html>`;
}
