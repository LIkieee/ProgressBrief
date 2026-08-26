# ProgressBrief implementation status

**Current state:** Gate 5 — Memory skill and persistence passes. Gates 0–5 are
implemented cumulatively in the commit containing this status update. Gates
6–10 remain unimplemented; Gate 6 fails honestly because `test:recall` is
absent.

## Gate 5 obligations completed

1. Expanded the canonical `progressbrief-memory` skill from its Gate 0 boundary
   scaffold into an imperative Capture/Remember dispatcher. It keeps Recall and
   Curate explicitly unavailable until their later gates, avoids the report
   confirmation interview, and documents exact first-use, persistence, and undo
   invocations in a shallow reference.
2. Implemented first-use Work Library setup in a caller-selected visible
   directory. Setup creates a validated YAML-frontmatter `workspace.md`,
   chronological Markdown Worklog area, individual Markdown Knowledge Notes,
   reports directory, small JSON Workspace map, and versioned mutation journal.
   Report-only generation remains setup-free.
3. Implemented Workspace configuration with employer→internal and
   personal→private defaults, stable Workspace/project IDs, archived state, and
   explicit repository association by resolved real path. A selected GitHub
   remote is read with an argument-array `git` invocation and canonicalized;
   unsupported discovered remotes retain the local association without blocking
   setup.
4. Implemented deterministic Capture/Remember classification for the documented
   examples, including a mixed fragment that creates linked Worklog and
   Knowledge records. Each write returns a one-line acknowledgement naming the
   Workspace and destination; the companion CLI exposes first-use setup,
   capture, and Workspace-scoped undo.
5. Implemented search-before-write inside only the active Workspace. Exact
   repeats are skipped; useful examples, caveats, or explicit sources enrich the
   existing stable note; similar wording is never silently merged; explicit
   related-note decisions create reciprocal links; supersession preserves and
   marks the earlier note while the new note points back to it.
6. Implemented schema validation at each Markdown serialization boundary.
   Worklog and Knowledge records carry stable project/source relationships, and
   mixed captures link the Worklog Entry to the resulting Knowledge Note.
7. Implemented sibling temporary-file writes with file flush and atomic rename,
   one bounded cross-process Work Library lock, dead-owner lock recovery, and a
   prepared/committed/rolled-back mutation journal. The next operation recovers
   prepared mutations left by an interrupted process.
8. Implemented `undo that` behavior as restoration of only the last committed
   ProgressBrief mutation in the selected Workspace. Mutations in a different
   Workspace remain untouched.
9. Implemented resolved-path authorization for every internal mutation target.
   Traversal and existing symlink escapes fail closed; archived Workspace capture
   and cross-Workspace Knowledge targets are rejected; archived Workspaces are
   omitted from default listing.
10. Added 14 substantive Gate 5 tests. The tests exercise real filesystem state,
    an actual Git repository and canonical remote, separate Node processes
    contending for the same lock, two concurrent process writes to one monthly
    Worklog, and a killed writer that really truncates a target before automatic
    journal recovery restores it.
11. Re-pointed the foundation falsifiability tripwire: Gate 5 is positively
    available, while every unbuilt Gate 6–10 fails at the next required suite,
    `test:recall`.

## Files changed

- `README.md`: records the Gate 5 capability boundary, current verifier,
  commands, and first-use/Capture/undo examples.
- `package.json` and `package-lock.json`: add the substantive `test:library`
  suite and promote the already-installed `yaml` parser to a runtime dependency
  for standards-compliant Markdown frontmatter.
- `skills/progressbrief-memory/SKILL.md` and
  `skills/progressbrief-memory/references/library-workflow.md`: define the
  implemented trigger, routing, setup, search-before-write, safety, CLI, and undo
  protocol while preserving the Gate 6/8 boundary.
- `src/cli/main.ts`: exposes `library init`, `memory capture`, and `memory undo`
  without changing creator review behavior.
- `src/index.ts`: exports the supported high-level Work Library API while
  leaving crash-injection and raw persistence primitives internal.
- `src/library/types.ts`: Work Library, Workspace, record, capture, resolution,
  and mutation types.
- `src/library/paths.ts`: slug generation and resolved containment/symlink
  authorization.
- `src/library/markdown.ts`: schema-validated Workspace, Worklog, and Knowledge
  Markdown serialization/parsing.
- `src/library/persistence.ts`: atomic writes, bounded cross-process locking,
  stale-owner recovery, mutation transactions, interrupted-write recovery, and
  undo primitives.
- `src/library/workspace.ts`: first-use setup, small Workspace map, repository
  association, active Workspace listing, archive state, and high-level undo.
- `src/library/capture.ts`: Capture/Remember classification, scoped reads,
  Worklog persistence, Knowledge search-before-write outcomes, linkage, and
  acknowledgements.
- `tests/library/setup-and-capture.test.mjs`,
  `tests/library/knowledge-and-undo.test.mjs`,
  `tests/library/boundaries-and-persistence.test.mjs`,
  `tests/library/cli-memory.test.mjs`, and
  `tests/library/helpers/library-worker.mjs`: 14 Gate 5 acceptance tests and the
  real child-process race/crash helper.
- `tests/foundation/foundation.test.mjs`: Gate 5 positive oracle and Gate 6–10
  falsifiability tripwire.
- `docs/implementation/status.md`: this standalone handoff.

No schema, report renderer, review path, workspace-level snapshot, canonical
history, or `supervisor/` file was modified. No HTML rendering behavior changed,
so no new report screenshots or HTML inspection were required.

## Command and result ledger

### Required source, recovery, and audit inspection

- `pwd && rg --files -g 'PROGRESSBRIEF_PRD.md' -g 'CONTEXT.md' -g
  'IMPLEMENTATION_CONTRACT.md' -g 'LOOP_RUNBOOK.md' -g 'docs/adr/**' -g
  'progressbrief/docs/implementation/status.md' -g 'supervisor/AUDIT-*.md'
  -g 'progressbrief/.git' -g 'progressbrief/package.json' | sort && ... git -C
  progressbrief status --short --branch` — passed; the repository existed on
  `main` and the worktree was clean.
- `wc -l` over the PRD, context, implementation contract, runbook, six ADRs,
  status, and all five audits — passed; established bounded complete-read ranges
  for 2,476 lines.
- Parallel bounded `sed` reads covering PRD lines 1–647, followed by complete
  `cat`/bounded reads of `CONTEXT.md` and implementation-contract lines 1–280 —
  passed; all product and technical authority was read completely.
- `sed -n '1,220p' docs/LOOP_RUNBOOK.md` and complete reads of all six ADRs —
  passed; Gate 5 obligations and stop conditions were confirmed.
- Complete bounded reads of `supervisor/AUDIT-gate0.md` through
  `supervisor/AUDIT-gate4.md` — passed. The latest verdict was Gate 4 PASS with
  no required changes; its Gate 5 lock, concurrency, interruption, substantive
  suite, and tripwire checks were carried forward.
- `cat progressbrief/docs/implementation/status.md` — passed; Gate 4 was the
  recorded completed state and there was no preserved work to recover.
- `find .. -name AGENTS.md -print && git status --short --branch && git log
  --oneline --decorate -6 && rg --files ... | sort` — passed; no `AGENTS.md`,
  clean Gate 4 commit `df89215`, and the expected repository contents.
- `wc -l`, complete grouped `cat`, and bounded `sed` reads over `package.json`,
  TypeScript/ESLint configuration, verifier scripts, foundation tests, memory
  skill, three Work Library schemas, contract types/IDs/validator, index, CLI,
  and all current Workspace/Worklog/Knowledge fixtures — passed.

### Test-first implementation and focused repair

- `npm run test:library` immediately after adding the first acceptance files —
  failed as intended: all three test files reported that `captureMemory` was not
  exported because the Work Library implementation did not exist.
- `tail -24 package.json && npm run build` after the first implementation —
  passed; this also exposed that `yaml` appeared in both dependency sections,
  which was repaired before lockfile regeneration.
- `npm install --package-lock-only --ignore-scripts && npm run test:library` —
  passed 12/12 after initial implementation; the lockfile now classifies `yaml`
  as runtime-only.
- `sed -n '1,240p' README.md && cat
  skills/progressbrief-memory/agents/openai.yaml` — passed; established the
  documentation and host-metadata edit boundary.
- `sed -n '1,180p' README.md && npm run build && npm run lint && ...` — build
  passed and lint failed on three real findings: an invalid narrowed template
  expression, a thrown lock-timeout symptom missing its caught cause, and one
  unused test import. All three were fixed without suppressions.
- Targeted `nl -ba` reads of the lint locations — passed and confirmed the
  repairs.
- `npm run lint && npm run typecheck && npm run test:library && npm run
  validate:skills` — lint and typecheck passed; the suite then found a real
  macOS `/var`→`/private/var` canonical-path defect in the CLI capture flow.
- `npm run test:library && npm run validate:skills` after canonicalizing the
  library root at capture entry — passed 13/13 and both skill validations.
- Sequential `npm run build`, `npm run lint`, `npm run typecheck`, `npm run
  test:contracts`, `npm run test:report`, `npm run test:browser`, `npm run
  test:review`, `npm run test:library`, and `npm run validate:skills` — all
  passed: 11 contract, 15 report, 10 browser, 7 review, and 13 initial library
  tests; 0 failures, 0 skipped, 0 todo.
- `npm run test:library` after strengthening automatic enrichment and
  similar-wording non-merge coverage — passed 14/14.
- `npm run build && npm run lint && npm run typecheck && npm run test:library
  && npm audit --omit=dev` after narrowing the public API — passed; 14 library
  tests and zero runtime vulnerabilities.

### Manual Work Library artifact inspection

- `find tmp -maxdepth 2 ... && git status --short && git diff --check && git
  diff --stat` — passed; only expected Gate 5 source/status changes and ignored
  earlier QA artifacts were present.
- `mkdir -p tmp/gate5-qa` followed by real `progressbrief library init`,
  `memory capture` Worklog, and `memory capture` Knowledge commands, then `find`,
  bounded `sed`, and `jq` inspection — passed. The CLI returned three one-line
  acknowledgements; the visible Workspace, monthly Worklog, individual
  Knowledge Note, config, and three committed journal entries were inspected.
- `shasum -a 256` over the five Gate 5 QA files and `wc -l` over new source,
  tests, and skill files — passed; hashes and paths are recorded below.

### Gate oracle and integrity checks

- `git diff -- package.json package-lock.json
  tests/foundation/foundation.test.mjs` — passed inspection: only the substantive
  suite, runtime YAML classification, and correctly re-pointed tripwire changed.
- `rg -n 'test\.skip|it\.todo|describe\.skip|--passWithNoTests|\|\| true|
  continue-on-error:\s*true|process\.exit\(0\)' .` with dependency/build/QA
  excludes plus `git diff --check` — passed; only pre-existing prohibition and
  historical status prose hits, with zero suppressions in test or verifier code.
- `npm run verify:gate -- 5` — **passed** cumulatively. `npm ci`, build, lint,
  typecheck, 4 foundation tests, both skill validations, CI validation, 11
  contract tests, 15 report tests, 10 browser tests, 7 review tests, and the
  final 14 library tests passed with 0 failures, 0 skipped, and 0 todo.
- `node scripts/verify-gate.mjs 6` — failed as required with `Gate 6 is not
  implemented: missing package scripts test:recall.`
- Final `git diff --check`, green-washing scan, boundary/status inspection,
  `npm audit --omit=dev`, and clean-tree check after commit — passed; no remote
  or tag exists and the committed worktree is clean.

## Artifacts and evidence

Durable executable evidence is committed under `tests/library/`. Supplementary
manual QA is ignored by Git and remains for the reviewing agent at
`tmp/gate5-qa/ProgressBrief-Library/`:

- `config/library.json` —
  `342705e36fa9e8a1efae31dd82db99201371c4c6a8386fcf0b5ea998427c7908`.
- `config/mutation-journal.json` —
  `811a47403bed6191c29c78df254e56d1aa3b12bf7e99e79b77220f61ee92dec8`.
- `workspaces/northstar-systems/workspace.md` —
  `c9835f16a2d032433b34359b291e7ce0a21795216874326f233f6cc21867c6a4`.
- `workspaces/northstar-systems/worklog/2026/2026-08.md` —
  `ea1dec48a032b57a92b64ca50759546fcdd27f8f8f3064dbe00f354194495ce4`.
- `workspaces/northstar-systems/knowledge/knw_ecf506f5-c2f3-49ee-9d40-f15d2946e555.md`
  — `acdd80d6dc4d4566b925d79c7c00be988e7f15f6ec127859cdeb42afc23379f4`.

## Judgment for review

- Used the operative whole-gate instruction over the runbook snapshot's older
  one-obligation wording, consistent with the Gate 2 audit's F7 resolution.
- Promoted the already-installed ISC-licensed `yaml` parser from development to
  runtime so Markdown frontmatter is standards-compliant and safely parsed. A
  hand-written YAML subset would create more persistence and security risk.
- Chose one library-wide cross-process lock rather than per-Workspace locks.
  Workspace writes are infrequent, while the config and mutation journal are
  shared; global serialization gives a smaller corruption surface and a clear
  bounded retry contract.
- Used a prepared journal entry before content changes and a committed state
  afterward. Dead PID detection removes only a lock whose recorded process is
  gone; the next lock holder restores every `before` image from prepared
  mutations before doing new work.
- Kept fault injection and raw mutation primitives out of the package root API.
  Acceptance helpers import compiled internal modules directly to prove a real
  killed-writer recovery without exposing crash controls to product callers.
- Made exact-repeat and automatic enrichment deterministic. Relatedness and
  supersession require an explicit target/action from the active agent because
  similar wording alone must never cause a merge or rewrite.
- Used a small conservative classifier for the documented immediate examples;
  the memory skill remains responsible for contextual semantic judgment. An
  unmarked, non-durable fragment defaults to Worklog, and consequential
  destination or Workspace ambiguity remains an agent question.
- Stored the Workspace path map and mutation journal as the contract-permitted
  small JSON machine state. Workspace, Worklog, and Knowledge content remains
  visible Markdown and is schema-validated on every serializer/parser boundary.
- Resolved local repository paths with `realpath` and invoked `git` with an
  argument array. A discovered non-GitHub remote is omitted rather than blocking
  local association; an explicitly supplied unsupported canonical remote fails
  instead of being guessed into the GitHub-only schema.
- Did not touch the renderer or review system. Gate 3/4 browser suites were
  rerun, but generating new HTML or screenshots would not add evidence for this
  persistence-only gate.

## Unresolved risks and next gate

- The Capture classifier is deliberately small and English-focused; natural
  context interpretation is a skill/agent responsibility. Gate 5 proves the
  canonical examples and safe destination behavior, not a standalone NLP model.
- Lock ownership uses PID liveness, which is appropriate for supported local
  hosts but cannot distinguish the extremely unlikely case of PID reuse after a
  crash. The bounded timeout remains the fail-safe.
- The mutation journal stores full prior Markdown for reliable undo. Very large
  long-lived libraries may eventually need journal compaction, but no data is
  opaque and V1 has no background compactor requirement.
- Generated source IDs identify the active user fragment when no external source
  was supplied. Gate 6 must decide how Recall presents conversational captures
  versus resolvable file/URL source links without inventing a locator.
- Cross-platform behavior is exercised only on the current native macOS host.
  Native Linux and WSL2 clean-host proof, including lock/PID/filesystem behavior,
  remains Gate 9.
- Carried audit items remain: feedback-queue concurrency is per review-server
  process (F13), `fs.watch` portability (F14), five visualization families lack
  screenshot baselines (F11), and the Gate 10 path/secret, `.npmrc`, package
  privacy, dependency/license, and release reviews remain outstanding.

**Commit intent:** `feat: implement Gate 5 Work Library persistence`.

**Next gate:** Gate 6 — Recall. Begin with failing `test:recall` coverage for
portable lexical retrieval across path/frontmatter/title/heading/body fields;
Workspace, project, time, topic, and visibility filters; query expansion and
agent reranking; concise grounded answers with note/source links; stale and
superseded conflicts; ambiguous Workspace selection; archived exclusion; and
no-result behavior. Do not begin Gate 7.
