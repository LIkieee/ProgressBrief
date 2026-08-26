# ProgressBrief

ProgressBrief turns scattered evidence of professional work into concise,
evidence-aware, visually structured reports. It is designed as a local-first,
open-source package for people who work with coding agents.

The product has two reporting modes:

- **Snapshot** synthesizes a person's work across workstreams for a reporting
  period.
- **Deep Dive** explains a project or body of work for a defined purpose and
  audience.

The companion **Work Library** is a local, human-readable collection of
worklog entries and knowledge notes used for Capture, Remember, Recall, and
Curate workflows. A Workspace is the privacy boundary around that content.

## Implementation status

The repository currently implements Gates 0–6: the foundation, semantic
contracts, Snapshot report path, deterministic clean HTML renderer, and the
creator review loop, plus Work Library persistence. The review wrapper supports
stable component and text
annotations, inline corrections as feedback operations, a durable queue,
explicit Codex and Claude Code handoffs, conflict detection, and live reload.
The memory path supports first-use setup, Workspace-scoped Capture and Remember,
search-before-write outcomes, linked Markdown records, atomic locked writes,
and per-Workspace undo. Recall adds portable lexical retrieval over paths,
metadata, headings, and bodies; Workspace/project/time/topic/visibility
filters; query expansion; agent reranking; grounded note links; and current-over-
superseded handling. Deep Dive, Curate, clean-host installation, and release
proof remain later gates and are not claimed as implemented yet.

## Requirements

- Node.js 24 LTS or newer
- npm 11 or newer as supplied with Node.js 24
- macOS, Linux, or Windows through WSL2

Native Windows and PowerShell are outside the V1 support boundary.

## Development

Install exactly the committed dependency graph and run the current gate:

```sh
npm ci
npm run verify:gate -- 6
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
  --directory "$PWD/ProgressBrief Library" \
  --workspace "Example Company" \
  --kind employer \
  --project "Migration"

progressbrief memory capture \
  --library "$PWD/ProgressBrief Library" \
  --workspace example-company \
  --text "Capture: we finished the migration, and staging migrations require VPN access."
```

Use `progressbrief memory undo --library <directory> --workspace <id-or-slug>`
to reverse only the last ProgressBrief mutation in that Workspace.

Recall a professional detail without generating a report:

```sh
progressbrief memory recall \
  --library "$PWD/ProgressBrief Library" \
  --workspace example-company \
  --query "What does staging require before migration?"
```

The memory skill first requests `--format candidates`, reranks only the returned
record IDs, and repeats the query with `--rerank <id,id>`. If Workspace scope is
ambiguous or there is no grounded result, Recall asks once or returns no result
instead of guessing.

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
- `docs/implementation/status.md` is the resumable gate ledger.

Installed host copies will be derived from `skills/`; they are not edited
directly. The package does not require hosted infrastructure and does not add
telemetry.

## License

ProgressBrief is available under the [MIT License](LICENSE).
