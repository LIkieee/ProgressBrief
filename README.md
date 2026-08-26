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

The repository currently contains the Gate 0 foundation and Gate 1 semantic
contracts: a complete synthetic three-workstream fixture, eight versioned JSON
Schemas, stable entity IDs and report revisions, semantic reference checks,
and a creator-only-safe export projection. Report generation, rendering,
persistence, and review features are delivered by later gates and are not
claimed as implemented yet.

## Requirements

- Node.js 24 LTS or newer
- npm 11 or newer as supplied with Node.js 24
- macOS, Linux, or Windows through WSL2

Native Windows and PowerShell are outside the V1 support boundary.

## Development

Install exactly the committed dependency graph and run the current gate:

```sh
npm ci
npm run verify:gate -- 1
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
```

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
