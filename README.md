# ProgressBrief

ProgressBrief turns scattered evidence of professional work into concise,
evidence-aware, visually structured reports. It is designed as a local-first,
open-source package for people who work with coding agents.

> **Pre-release source preview:** the implemented product passes Gate 8, but
> clean-host installation and release hardening are not complete. The package
> is intentionally private and is not published to npm yet.

The product has two reporting modes:

- **Snapshot** synthesizes a person's work across workstreams for a reporting
  period.
- **Deep Dive** explains a project or body of work for a defined purpose and
  audience.

The companion **Work Library** is a local, human-readable collection of
worklog entries and knowledge notes used for Capture, Remember, Recall, and
Curate workflows. A Workspace is the privacy boundary around that content.

## Implementation status

Gates 0–8 are implemented: semantic contracts, Snapshot and Deep Dive reports,
deterministic accessible HTML, creator review, Work Library persistence,
Capture, Remember, Recall, and approval-gated Curate. The cumulative Gate 8
oracle covers 86 substantive tests. See the public
[implementation status](docs/implementation/status.md) for capabilities,
boundaries, and remaining release work.

## Requirements

- Node.js 24 LTS or newer
- npm 11 or newer as supplied with Node.js 24
- macOS, Linux, or Windows through WSL2

Native Windows and PowerShell are outside the V1 support boundary.

## Try the skills in Codex

This repository exposes its two canonical skills through `.agents/skills`.
For the current developer setup, build and link the companion CLI first:

```sh
npm ci
npm run build
npm link
```

This is a local development link, not the final Gate 9 installation flow.
Launch Codex from the repository root, type `/skills`, or invoke one explicitly:

```text
$progressbrief-report Create a weekly Snapshot for my manager from this
repository's Git history and my notes. Generate now.
```

```text
$progressbrief-memory Remember: staging load tests require replay-safe mode.
```

The report skill creates evidence-aware Snapshots and Deep Dives. The memory
skill handles Capture, Remember, Recall, and Curate. The TypeScript CLI is the
deterministic companion runtime used by those workflows; report synthesis is
currently agent-driven rather than a standalone `report generate` command.

## Development

Install exactly the committed dependency graph and run the current gate:

```sh
npm ci
npm run verify:gate -- 8
```

Individual foundation checks are also stable:

```sh
npm run build
npm run lint
npm run typecheck
npm test
npm run validate:skills
npm run validate:ci
npm run test:contracts
npm run test:report
npm run test:browser
npm run test:review
npm run test:library
npm run test:recall
npm run test:deep-dive
npm run test:curate
```

Start creator review for an existing source model and clean HTML artifact:

```sh
progressbrief review \
  --root ./report-output \
  --report-model ./report-output/source-model.json \
  --report-html ./report-output/clean-report.html \
  --queue ./report-output/feedback-queue.json
```

Initialize a visible Work Library, then Capture or Remember a fragment:

```sh
progressbrief library init \
  --directory "$HOME/Documents/ProgressBrief Library" \
  --workspace "Example Company" \
  --kind employer \
  --project "Migration"

progressbrief memory capture \
  --library "$HOME/Documents/ProgressBrief Library" \
  --workspace example-company \
  --text "Capture: we finished the migration, and staging migrations require VPN access."
```

Keep Work Libraries outside the repository clone: they contain private or
internal professional data by design.

Use `progressbrief memory undo --library <directory> --workspace <id-or-slug>`
to reverse only the last ProgressBrief mutation in that Workspace.

Recall a professional detail without generating a report:

```sh
progressbrief memory recall \
  --library "$HOME/Documents/ProgressBrief Library" \
  --workspace example-company \
  --query "What does staging require before migration?"
```

The memory skill first requests `--format candidates`, reranks only the returned
record IDs, and repeats the query with `--rerank <id,id>`. If Workspace scope is
ambiguous or there is no grounded result, Recall asks once or returns no result
instead of guessing.

Discover Curate candidates without mutating the Work Library:

```sh
progressbrief memory curate \
  --library "$HOME/Documents/ProgressBrief Library" \
  --workspace example-company
```

After reviewing a versioned proposal and explicitly approving it, apply it with
`--proposal <file> --approve true`. Omitting or rejecting approval leaves both
the Markdown notes and mutation journal unchanged. Approved curation preserves
note files, records one atomic Workspace mutation, and remains reversible with
`progressbrief memory undo`.

`verify:gate` is cumulative. A gate that has not been implemented fails when
its required suite is absent; future suites are never represented by passing
placeholders. `npm run verify` is reserved for the complete Gate 10 release
oracle and is expected to fail before that work exists.

## Package boundaries

- `skills/progressbrief-report` is the canonical report-generation skill.
- `skills/progressbrief-memory` is the canonical Work Library skill.
- `src/` contains the shared TypeScript CLI and implementation.
- `schemas/` contains the versioned interchange and persistence contracts.
- `fixtures/` and `tests/` contain synthetic acceptance evidence.
- `docs/implementation/status.md` is the public capability and roadmap ledger.
- `.agents/skills/` exposes repository-local links to the canonical skills.

Installed host copies will be derived from `skills/`; they are not edited
directly. The package does not require hosted infrastructure and does not add
telemetry.

## License

ProgressBrief is available under the [MIT License](LICENSE).
