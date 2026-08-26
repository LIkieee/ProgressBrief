# ProgressBrief implementation status

**Current state:** Gate 8 — Curate passes. Gates 0–8 are implemented
cumulatively in the commit containing this status update. Gates 9–10 remain
unimplemented; both fail honestly because `test:install` is absent.

## Gate 8 obligations completed

1. Added read-only Curate discovery for all five runbook candidates:
   duplicate, contradiction, stale-note, missing-link, and broad-note. Every
   result names stable note IDs, current content hashes, a review reason, and
   suggested operation families. Discovery writes no Work Library byte.
2. Added versioned, invariant-checked curation proposals with explicit
   Workspace scope, selected candidate IDs, current note hashes, a summary,
   and typed merge, move, rewrite, relation, and supersession operations.
3. Kept candidate heuristics advisory. A match never mutates automatically,
   and the memory skill tells the agent to present it as a candidate rather
   than a confirmed duplicate or contradiction.
4. Added explicit approval as the mutation boundary. Omitted or false approval
   returns immediately without reading or writing the library; acceptance
   evidence compares every file, including the mutation journal, byte-for-byte.
5. Applied approved proposals under the existing recovered cross-process lock
   as one atomic, journaled Workspace mutation. A note hash change after
   discovery fails closed before any Curate write.
6. Preserved history: merge keeps the duplicate note file and marks it
   superseded; supersession keeps the predecessor; rewrite and project move
   retain the note's stable ID and created timestamp; relation is reciprocal.
7. Reused the existing Workspace-scoped mutation journal and undo. Acceptance
   evidence applies all five operation families together, then restores every
   affected Knowledge Note byte-for-byte with ordinary `memory undo`.
8. Added `progressbrief memory curate` candidate JSON and proposal application.
   `--proposal <file>` without `--approve true` is a rejection and does not
   mutate; archived Workspace discovery requires `--include-archived true`.
9. Expanded `progressbrief-memory` instructions with a Curate-specific
   discovery, proposal, approval, conflict, preservation, and undo workflow.
10. Added seven substantive Gate 8 tests and re-pointed the foundation
    falsifiability tripwire: Gate 8 is positively available, while Gates 9–10
    fail at the next normative suite, `test:install`.

## Files changed

- `src/library/curate.ts`: candidate discovery, proposal types and invariants,
  content-hash conflict detection, approved operation application, and result
  contracts.
- `src/cli/main.ts`: Curate discovery and explicitly approved proposal apply
  command paths.
- `src/index.ts`: public Curate functions and TypeScript types.
- `fixtures/curate/cases.json`: exact required candidate and operation kind
  manifest.
- `tests/curate/helpers/curate-fixture.mjs`: isolated synthetic Work Library
  with two projects and deterministic examples for every candidate kind.
- `tests/curate/discovery-and-proposals.test.mjs`: read-only discovery,
  candidate/operation completeness, proposal invariants, hash, Workspace,
  project, and archived-scope negatives.
- `tests/curate/apply-and-undo.test.mjs`: byte-exact rejection, atomic approved
  operations, preserved note history, conflict handling, journal evidence, and
  byte-exact Knowledge Note undo.
- `tests/curate/cli.test.mjs`: CLI discovery and explicit approval boundary.
- `package.json`: real `test:curate` runner. No dependency changed, so
  `package-lock.json` did not require an edit.
- `tests/foundation/foundation.test.mjs`: Gate 8 positive tripwire and Gate
  9–10 negative tripwire at `test:install`.
- `skills/progressbrief-memory/SKILL.md`: implemented Curate workflow and
  retained later-gate capability boundary.
- `skills/progressbrief-memory/references/curate-workflow.md`: operational
  candidate review, proposal, approval, apply, conflict, and undo sequence.
- `skills/progressbrief-memory/references/library-workflow.md`: separates
  Capture's immediate-write rule from Curate approval.
- `skills/progressbrief-memory/agents/openai.yaml`: Curate-aware short
  description.
- `README.md`: Gate 8 capability, CLI, verifier, and suite documentation.
- `docs/implementation/status.md`: this standalone handoff.

No persistent schema, report model, renderer, review server, existing fixture,
workspace-level snapshot, canonical history, or `supervisor/` file was
modified. Rendering did not change, so no generated HTML or screenshot
inspection was required. The Deep Dive suite still pins the audited Snapshot
render hash `3c1188e833955ba7cb790df05bd369ba357d6c02cbd5a720161e94c62caea908`.

## Command and result ledger

### Required source, recovery, and audit inspection

- `pwd && rg --files -g 'PROGRESSBRIEF_PRD.md' -g 'CONTEXT.md' -g
  'IMPLEMENTATION_CONTRACT.md' -g 'LOOP_RUNBOOK.md' -g 'status.md' -g
  'AUDIT-*.md' -g '*.md' docs/adr supervisor progressbrief/docs/implementation
  outputs docs 2>/dev/null | sort && if [ -d progressbrief/.git ]; then git -C
  progressbrief status --short --branch; else echo 'NO_PROGRESSBRIEF_GIT'; fi`
  — passed; found every required source and a clean Gate 7 repository.
- `wc -l outputs/PROGRESSBRIEF_PRD.md CONTEXT.md
  docs/IMPLEMENTATION_CONTRACT.md docs/LOOP_RUNBOOK.md docs/adr/*.md
  progressbrief/docs/implementation/status.md supervisor/AUDIT-*.md
  supervisor/HALT.md supervisor/PROGRESS.md` — passed; established complete
  read bounds.
- `sed -n '1,220p' outputs/PROGRESSBRIEF_PRD.md`, `sed -n '221,440p'
  outputs/PROGRESSBRIEF_PRD.md`, and `sed -n '441,647p'
  outputs/PROGRESSBRIEF_PRD.md` — passed; read the PRD and all 18 acceptance
  criteria completely.
- `sed -n '1,61p' CONTEXT.md && sed -n '1,280p'
  docs/IMPLEMENTATION_CONTRACT.md && sed -n '1,188p'
  docs/LOOP_RUNBOOK.md && for f in docs/adr/*.md; do sed -n '1,999p'
  "$f"; done` — passed; read canonical language, the normative Gate 8
  mapping, gate exit conditions, and every ADR completely.
- `sed -n '1,311p' progressbrief/docs/implementation/status.md && sed -n
  '1,126p' supervisor/AUDIT-gate7.md && sed -n '1,135p'
  supervisor/HALT.md` — passed; Gate 7 was complete and audited PASS with no
  required changes. The latest audit required a byte-level rejection test and
  reversible, history-preserving approved mutations for Gate 8.
- `sed -n '1,249p' supervisor/AUDIT-gate0.md && sed -n '1,254p'
  supervisor/AUDIT-gate1.md`, `sed -n '1,183p'
  supervisor/AUDIT-gate2.md && sed -n '1,193p'
  supervisor/AUDIT-gate3.md && sed -n '1,132p'
  supervisor/AUDIT-gate4.md`, and `sed -n '1,137p'
  supervisor/AUDIT-gate5.md && sed -n '1,126p'
  supervisor/AUDIT-gate6.md` — passed; read every prior audit completely and
  carried their standing checks and release risks forward.
- `find .. -name AGENTS.md -print && git status --short --branch && git log
  --oneline --decorate -10 && rg --files src/library tests/library tests/recall
  schemas fixtures skills/progressbrief-memory scripts | sort && sed -n
  '1,240p' package.json && sed -n '1,240p'
  tests/foundation/foundation.test.mjs && sed -n '1,240p'
  scripts/gate-map.mjs && sed -n '1,240p' scripts/verify-gate.mjs` — passed;
  no `AGENTS.md` applies, the worktree was clean at audited commit `a41db88`,
  and Gate 8 was the earliest unmet gate.
- `wc -l src/library/*.ts src/cli/*.ts src/index.ts
  tests/library/*.test.mjs tests/recall/*.test.mjs
  tests/recall/helpers/*.mjs skills/progressbrief-memory/SKILL.md
  skills/progressbrief-memory/references/*.md schemas/workspace.schema.json
  schemas/knowledge-note.schema.json schemas/worklog-entry.schema.json
  schemas/common.schema.json fixtures/recall/cases.json README.md tsconfig.json
  tsconfig.build.json` — passed; bounded the Gate 8 implementation surface.
- Complete `sed` reads covered `src/library/types.ts`, `workspace.ts`,
  `markdown.ts`, `paths.ts`, `persistence.ts`, `capture.ts`, and `recall.ts`;
  all existing Library and Recall tests; the memory skill and all references;
  `src/cli/main.ts`, `src/index.ts`; relevant schemas; and `README.md`. These
  commands passed and established the reusable lock, journal, undo, Workspace,
  Markdown, and CLI contracts before implementation.

### Test-first implementation and focused checks

- `mkdir -p tests/curate/helpers fixtures/curate` — passed; created only the
  Gate 8 test and fixture directories.
- `npm run test:curate` after adding the manifest, fixture helper, seven
  acceptance tests, real suite script, and re-pointed tripwire — failed as
  intended: three test files could not import the absent
  `applyCurationProposal`, `createCurationProposal`, and discovery exports; 0
  tests passed and no test was skipped or marked todo.
- `npm run test:curate` after the initial Curate implementation and public
  exports — passed 7/7, 0 failures, 0 skipped, 0 todo.
- `sed -n '1,160p' skills/progressbrief-memory/agents/openai.yaml && git diff
  --check && git diff --stat && git status --short` — passed; identified the
  remaining skill/docs updates and no whitespace errors.
- Complete `sed` reads of the updated `README.md`, memory `SKILL.md`, and
  `curate-workflow.md` — passed; found and then repaired one awkward README
  sentence before verification.
- `npm run lint && npm run typecheck && npm run validate:skills && git diff
  --check` — first run failed honestly on one unused test import; lint stopped
  the remaining chained checks.
- The same `npm run lint && npm run typecheck && npm run validate:skills && git
  diff --check` after removing that import — passed completely under strict
  TypeScript; both canonical skills validated.
- `npm run test:library && npm run test:recall && npm run test:curate` — passed:
  14 Library, 11 Recall, and 7 Curate tests; 32 total with 0 failures, 0
  skipped, 0 todo.
- `npm run test:curate && npm run lint && npm run typecheck && npm run
  validate:skills && git diff --check` after tightening UUID/timestamp/hash
  validation — passed: 7/7 Curate tests and every static/skill check.
- `wc -l src/library/curate.ts tests/curate/*.test.mjs
  tests/curate/helpers/*.mjs skills/progressbrief-memory/SKILL.md
  skills/progressbrief-memory/references/curate-workflow.md && git diff --check
  && git diff -- ...` — passed; the memory skill remains below 500 lines and
  the tracked diff contains no whitespace error.
- `git status --short && git diff --check && git diff --stat && find
  fixtures/curate tests/curate -type f -maxdepth 3 -print | sort` — passed;
  enumerated the complete Gate 8 worktree before status preparation.

### Gate oracle and integrity checks

- `npm run verify:gate -- 8` — passed cumulatively before final validation
  tightening: 4 foundation, 11 contract, 15 report, 10 browser, 7 review, 14
  Library, 11 Recall, 7 Deep Dive, and 7 Curate tests; 86 substantive tests,
  0 failures, 0 skipped, 0 todo. `npm ci` reported zero vulnerabilities.
- `npm run verify:gate -- 9` — failed honestly with rc=1 and `Gate 9 is not
  implemented: missing package scripts test:install.`
- `npm run verify:gate -- 10` — failed honestly with rc=1 and missing
  `test:install`, `test:security`, and `test:release`.
- Final `npm run verify:gate -- 8` after every production, test, skill, and
  documentation change — **passed cumulatively** with the same 86 substantive
  tests, 0 failures, 0 skipped, and 0 todo. Dependency installation again
  reported zero vulnerabilities.
- `../supervisor/check-tripwire.sh 9 && npm audit --omit=dev && rg -n --glob
  '!node_modules/**' --glob '!dist/**' --glob '!.npm-cache/**' --glob
  '!docs/implementation/status.md'
  'test\.skip|it\.todo|describe\.skip|--passWithNoTests|\|\| true|continue-on-error:\s*true|process\.exit\(0\)'
  .` — passed. The tripwire has a genuine positive Gate 8 assertion and an
  `assert.throws` loop over Gates 9–10 at `test:install`; runtime audit found
  zero vulnerabilities; the only suppression-pattern match was the existing
  prohibition in `CONTRIBUTING.md`.

## Artifacts and evidence

Committed, reproducible evidence:

- `fixtures/curate/cases.json` — exact Gate 8 candidate and operation sets.
- `tests/curate/discovery-and-proposals.test.mjs` — candidate completeness,
  non-mutation, advisory operation coverage, hashes, proposal invariants,
  Workspace/project boundaries, and archived selection.
- `tests/curate/apply-and-undo.test.mjs` — no-mutation rejection, all approved
  operation families, one atomic journal mutation, preserved history,
  stale-proposal conflict, and byte-exact note restoration through undo.
- `tests/curate/cli.test.mjs` — user-facing discovery and explicit approval.
- `tests/curate/helpers/curate-fixture.mjs` — synthetic, isolated, two-project
  Work Library created in temporary directories for every test.

No generated HTML, screenshot, live credential, GitHub access, mutable external
content, or committed temporary library is needed to regenerate this evidence.

## Judgment for review

- Candidate discovery intentionally uses conservative structural heuristics:
  normalized identical title/body for duplicates, shared topic/project plus
  corrective language for possible contradiction, explicit superseded status
  for stale notes, a shared source without a relation for missing links, and at
  least five topics or an 800-character body for broad notes. These are review
  prompts, never automatic conclusions or writes.
- Modeled a Curate `move` as changing project placement within the active
  Workspace. Crossing Workspaces would alter a privacy boundary and is
  rejected; note files remain in their Workspace's Knowledge directory.
- Kept proposals as versioned runtime/interchange objects rather than adding a
  ninth required persistent schema. Proposals are user-reviewed files, not
  authoritative Work Library documents; all fields and references are checked
  at runtime before apply.
- Content-derived candidate IDs are transient review identities. Persisted
  report, note, and Workspace IDs remain opaque UUID-based IDs. A changed note
  deliberately changes its candidate identity and also fails the proposal's
  expected-hash check.
- Rejection returns before library setup, Workspace lookup, or lock acquisition
  so the guarantee is literally zero Work Library I/O. Approved apply performs
  full scope, candidate, project, operation, and content-hash validation.
- Merge preserves the duplicate file and marks it superseded; it combines
  metadata into the chosen canonical note and records a structural
  `supersedes` relation rather than deleting history.
- Reused Gate 5's atomic write, recovered cross-process lock, mutation journal,
  and Workspace undo rather than adding a Curate-specific persistence path.
- Added no runtime dependency, schema, background scheduler, automatic cleanup,
  cross-Workspace mutation, report interview, or HTML output.

## Unresolved risks and next gate

- Heuristic candidate discovery can produce false positives or miss semantic
  duplicates/contradictions. The approval boundary prevents automatic damage;
  future measured evidence may justify richer agent-assisted proposal logic.
- Curation proposals are runtime-validated but do not yet have a standalone
  JSON Schema. Gate 10 can decide whether release examples need one without
  changing the Gate 8 behavior.
- Carried audit items remain: review live reload relies on `fs.watch`
  portability (F14); five visualization families lack screenshot baselines
  (F11); Recall query expansion is English-focused (F17); and Gate 10 owns
  delimiter-adversarial path/secret tests, `.npmrc`, package privacy,
  dependency/license, and release reviews.
- Native Linux and WSL2 clean-host evidence is not available from this native
  macOS invocation. Gate 9 requires those environments, Claude Code and Codex
  clean-install smoke flows, and explicit handling of the `sharp` native
  binary and `fs.watch` portability risks. Do not claim Gate 9 without that
  evidence.

**Commit intent:** `feat: implement Gate 8 Curate`.

**Next gate:** Gate 9 — Installation and host compatibility. Begin only with
the required clean-host evidence and authority available; do not begin Gate 10.
