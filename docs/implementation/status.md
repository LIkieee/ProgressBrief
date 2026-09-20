# ProgressBrief implementation status

## Current state

ProgressBrief is a pre-release source preview. Gates 0–8 are implemented and
validated cumulatively. Gates 9–10 remain intentionally unavailable; the
release oracle fails when a required later-gate suite is absent rather than
representing future work with passing placeholders.

Current commit intent: **Gate 8 — Curate**.

## Implemented capabilities

- Versioned JSON Schema contracts and cross-reference validation for reports,
  evidence, visualizations, feedback, Workspaces, Worklog entries, and
  Knowledge Notes.
- Snapshot reports for time-bounded work across workstreams.
- Deep Dive reports for purpose-bounded project explanations.
- Deterministic, self-contained HTML with presentation and reading views,
  responsive layouts, print support, semantic visualizations, and restrictive
  content security policy.
- Creator review through a loopback-only local server, stable component and
  selected-text targets, durable feedback queues, inline corrections, conflict
  detection, and live reload.
- A human-readable Markdown Work Library with Workspace privacy boundaries,
  atomic locked writes, interrupted-mutation recovery, and per-Workspace undo.
- Capture and Remember with search-before-write handling for exact duplicates,
  enrichment, relationships, and supersession.
- Recall with Workspace/project/date/topic/visibility filtering, portable
  lexical retrieval, query expansion, agent reranking of retrieved IDs, note
  links, and current-over-superseded ordering.
- Curate discovery for duplicate, contradiction, stale-note, missing-link, and
  broad-note candidates. Merge, move, rewrite, relation, and supersession apply
  only through an explicitly approved, hash-checked, reversible proposal.

## Verification

Run the cumulative implemented gate from the committed dependency graph:

```sh
npm ci
npm run verify:gate -- 8
```

The Gate 8 oracle covers 86 substantive tests across foundation, contracts,
report behavior, browser rendering and accessibility, creator review, Work
Library persistence, Recall, Deep Dive, and Curate. Tests must not be skipped,
marked todo, or replaced by empty placeholder suites.

## Known boundaries

- The npm package remains private at version `0.0.0`; no published release is
  claimed.
- Clean-host installation across Codex, Claude Code, macOS, Linux, and WSL2 is
  not yet proven.
- Native Windows and PowerShell are outside the V1 support boundary.
- Recall query expansion is intentionally small and English-focused.
- Curate discovery uses conservative heuristics that may produce false
  positives or miss semantic duplicates and contradictions; proposals remain
  advisory until explicitly approved.
- Review live reload still needs broader `fs.watch` portability evidence.
- Five visualization families have semantic and browser coverage but do not
  yet have dedicated screenshot baselines.
- GitHub collection is read-only by product policy; a packaged collection
  adapter is not yet implemented.

## Remaining gates

### Gate 9 — installation and host compatibility

- Prove clean installation and representative workflows in Codex and Claude
  Code.
- Validate macOS, Linux, and WSL2 behavior, including the `sharp` native binary
  and file watching.
- Define the supported skill and CLI installation paths.

### Gate 10 — security and release

- Add the security and release-content suites.
- Complete package metadata, privacy, dependency, license, and adversarial
  secret/path review.
- Produce the final release oracle and publishable artifacts.

Do not claim V1 completion until both gates pass.
