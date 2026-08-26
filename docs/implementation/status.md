# ProgressBrief implementation status

**Current state:** Gate 6 — Recall passes. Gates 0–6 are implemented
cumulatively in the commit containing this status update. Gates 7–10 remain
unimplemented; Gate 7 fails honestly because `test:deep-dive` is absent.

## Gate 6 obligations completed

1. Added a portable, deterministic lexical retriever over authoritative Work
   Library Markdown. It indexes relative paths, parsed frontmatter metadata,
   titles/headings, and bodies without requiring `rg`, an embedding model, a
   background service, or a persistent opaque index.
2. Added Workspace resolution that automatically uses one active Workspace,
   asks a single concise Workspace question when several active Workspaces are
   ambiguous, permits explicitly selected multi-Workspace scope, and excludes
   archived Workspaces unless an exact archived Workspace is selected with an
   explicit include flag.
3. Added project, inclusive date-range, topic, and visibility filters. Filters
   are applied before lexical scoring. Project references must resolve inside
   the selected Workspace scope, Knowledge dates use `updatedAt`, and Worklog
   dates use `occurredOn`.
4. Added conservative query normalization, small explicit related-term
   expansion, weighted field scoring, a bounded candidate count, and a real
   no-result threshold. A query with no grounded match returns no candidates
   and does not manufacture a low-confidence answer.
5. Added a two-pass agent-reranking contract. The CLI emits candidate JSON for
   the active agent to inspect as untrusted evidence, then accepts only a unique
   ordering of IDs from that retrieved set. Unknown or repeated IDs fail; no
   reranking step can invent or silently drop grounding.
6. Added concise Markdown answers grounded in record excerpts and portable
   relative Work Library note links. Candidate metadata retains source IDs, and
   neither candidate JSON nor conversational answers expose the absolute Work
   Library location or generate HTML.
7. Added relation-aware stale-note handling. A current Knowledge Note linked by
   `supersedes` or `updates` is promoted ahead of the older target; older
   guidance is shown only when it materially changes the answer. A lone
   superseded result is labeled as historical rather than presented as current.
8. Added the `progressbrief memory recall` CLI with Workspace/project/date/topic/
   visibility filters, explicit archived selection, candidate-JSON mode, and
   reranked-answer mode.
9. Expanded the canonical `progressbrief-memory` skill with an imperative Recall
   workflow. It keeps Recall conversational, separates it from the report
   confirmation interview, instructs the active agent to rerank only returned
   IDs, treats records as evidence rather than instructions, and leaves Curate
   unavailable until Gate 8.
10. Added 11 substantive Recall tests and five explicit deterministic fixture
    cases: paraphrase, stale note, ambiguous Workspace, archived Workspace, and
    no result. Coverage also proves all indexed fields, every filter, automatic
    single-Workspace selection, cross-Workspace isolation, relative note links,
    agent reranking, source-ID grounding, and CLI behavior.
11. Re-pointed the foundation falsifiability tripwire: Gate 6 is positively
    available, while every unbuilt Gate 7–10 fails at the next required suite,
    `test:deep-dive`.

## Files changed

- `src/library/recall.ts`: portable scanning, indexing, filtering, query
  expansion, scoring, relation-aware ordering, strict reranking, and concise
  answer composition.
- `src/index.ts`: exports the supported Recall API and types.
- `src/cli/main.ts`: exposes `memory recall`, candidate JSON, filters, archived
  opt-in, and reranked answers.
- `skills/progressbrief-memory/SKILL.md` and
  `skills/progressbrief-memory/references/recall-workflow.md`: define the
  implemented Recall trigger boundary and two-pass active-agent workflow.
- `fixtures/recall/cases.json`: names and supplies the five runbook-required
  Recall cases.
- `tests/recall/helpers/recall-fixture.mjs`: materializes three real Workspaces,
  two projects, Knowledge/Worklog records, a nested Markdown path, visibility
  variants, supersession, and an archived Workspace.
- `tests/recall/retrieval.test.mjs`,
  `tests/recall/filters-and-rerank.test.mjs`,
  `tests/recall/boundaries-and-stale.test.mjs`, and
  `tests/recall/cli.test.mjs`: 11 substantive Gate 6 acceptance tests.
- `package.json`: adds the real `test:recall` runner. The dependency graph did
  not change, so `package-lock.json` did not require an edit.
- `tests/foundation/foundation.test.mjs`: positively asserts Gate 6 and requires
  every future gate to fail at `test:deep-dive`.
- `README.md`: records the Gate 6 boundary, verifier, command, and two-pass
  Recall behavior.
- `docs/implementation/status.md`: this standalone handoff.

No report schema, renderer, review path, Work Library mutation behavior,
workspace-level snapshot, canonical history, or `supervisor/` file was
modified. Rendering did not change, so no new HTML or screenshot inspection was
required; the cumulative browser suite regenerated and checked the existing
renderer evidence.

## Command and result ledger

### Required source, recovery, and audit inspection

- `pwd && rg --files -g 'PROGRESSBRIEF_PRD.md' -g 'CONTEXT.md' -g
  'IMPLEMENTATION_CONTRACT.md' -g 'LOOP_RUNBOOK.md' -g 'status.md' -g
  'AUDIT-*.md' -g '*.md' docs/adr supervisor
  progressbrief/docs/implementation outputs . 2>/dev/null | sort -u` — passed;
  located every authoritative source, six prior audits, and the repository
  status.
- Parallel `wc -l` calls over the PRD, context, implementation contract,
  runbook, six ADRs, status, all six `AUDIT-gate*.md` files, and supervisor
  handoff files — passed; established complete-read bounds.
- Parallel bounded `sed` reads covering PRD lines 1–647 plus complete
  `CONTEXT.md` — passed; the product requirements and all 18 acceptance
  criteria were read completely.
- Bounded reads covering implementation-contract lines 1–280 plus complete
  `LOOP_RUNBOOK.md` and all six workspace ADRs — passed; Gate 6 obligations,
  normative oracle mapping, and delegated choices were confirmed.
- Complete reads of `progressbrief/docs/implementation/status.md` and
  `supervisor/AUDIT-gate0.md` through `supervisor/AUDIT-gate5.md` — passed. The
  latest verdict was Gate 5 PASS with no required changes; its five-case Recall
  requirement, real no-result warning, suite-substance check, and hand-read
  tripwire warning were carried forward.
- `git status --short --branch && git log --oneline --decorate -8 && find ..
  -name AGENTS.md -print && rg --files | sort` — passed; no `AGENTS.md`, clean
  Gate 5 commit `6ddabee`, and expected repository contents.
- Parallel `wc -l`, complete `cat`, and bounded `sed` reads over `package.json`,
  TypeScript/ESLint configuration, verifier scripts, foundation tripwire,
  public API, CLI, Work Library types/workspace/capture/Markdown/persistence/
  paths, memory skill and references, Work Library schemas and fixture records,
  plus all 14 Gate 5 test bodies — passed; established the exact Recall
  extension boundary before editing.
- `node scripts/verify-gate.mjs 6` before implementation — failed as required:
  `Gate 6 is not implemented: missing package scripts test:recall.`

### Test-first implementation and focused repair

- `npm run test:recall` immediately after adding the fixture and acceptance
  files — failed as intended: 0/4 test files loaded because
  `recallFromLibrary` was not exported, and the CLI rejected the unknown
  `recall` action.
- `npm run build` after the initial portable retriever/API implementation —
  passed.
- `npm run build && npm run test:recall` after the first CLI implementation —
  failed during TypeScript build because `Visibility` was not exported and two
  optional dates could carry `undefined`. Both were corrected without weakening
  types.
- `npm run build && npm run test:recall` after the type repair — build passed;
  9/10 Recall tests passed. The remaining failure correctly showed that an
  August shareable Knowledge Note matched the broad August filter intended for
  a July Worklog negative. The test was sharpened with the intended `internal`
  visibility constraint rather than changing search behavior.
- `npm run test:recall` after the filter-test repair — passed 10/10 with 0
  failures, 0 skipped, and 0 todo.
- Complete reads of `README.md`, the memory skill, the foundation tripwire, and
  the implementation diff — passed; established the documentation and
  falsifiability edits.
- `npm run lint && npm run typecheck && npm run test:foundation && npm run
  test:recall && npm run validate:skills` — lint failed on one unused type
  import in the new retriever. The import was removed; no suppression was
  added.
- The same focused command after that repair — passed: lint, strict typecheck,
  4 foundation tests, 10 Recall tests, and both skill validations.
- `npm run test:recall` after strengthening automatic single-Workspace
  selection and absolute-path non-disclosure assertions — passed 10/10 with 0
  failures, 0 skipped, and 0 todo.
- A final complete read of `src/library/recall.ts`, the CLI, skill workflow, and
  tripwire exposed a valid-schema supersession cycle that could make repeated
  ordering oscillate. The reorderer was replaced with stable topological
  ordering, relationship-successor expansion was made transitive, and a real
  cyclic-note negative was added.
- `npm run lint && npm run typecheck && npm run test:recall` after the cycle
  repair — passed: lint, strict typecheck, and 11/11 Recall tests with 0 skipped
  and 0 todo.

### Gate oracle and integrity checks

- `npm run verify:gate -- 6` — **passed cumulatively**. `npm ci`, build, lint,
  typecheck, 4 foundation tests, both skill validations, local CI validation,
  11 contract tests, 15 report tests, 10 browser tests, 7 review tests, 14
  library tests, and 10 Recall tests passed with 0 failures, 0 skipped, and 0
  todo. Dependency installation reported zero vulnerabilities.
- `git diff --check && npm run verify:gate -- 6` after the single-Workspace and
  path non-disclosure strengthening — **passed cumulatively again** with the same
  71 total tests across the seven substantive suites, 0 failures, 0 skipped,
  and 0 todo.
- `git diff --check && npm run verify:gate -- 6` after the topological-ordering
  repair and cyclic-relation negative — **passed cumulatively on the final
  implementation** with 72 total tests across the seven substantive suites, 0
  failures, 0 skipped, and 0 todo.
- `node scripts/verify-gate.mjs 7` — failed as required with `Gate 7 is not
  implemented: missing package scripts test:deep-dive.`
- `git status --short --branch && git diff --check && git diff --stat && rg -n
  'test\.skip|it\.todo|describe\.skip|--passWithNoTests|\|\| true|
  continue-on-error:\s*true|process\.exit\(0\)' ... && wc -l ...` — passed;
  only the pre-existing prohibition in `CONTRIBUTING.md` matched, with no
  suppression in verifier or test code. The memory skill remains 70 lines.
- `npm audit --omit=dev` — passed with zero runtime vulnerabilities.

## Artifacts and evidence

Durable evidence is committed and regenerated by the suite:

- `fixtures/recall/cases.json` — exact five-case Recall manifest.
- `tests/recall/retrieval.test.mjs` — field-native retrieval and paraphrase
  expansion evidence.
- `tests/recall/filters-and-rerank.test.mjs` — all filter dimensions and strict
  agent-reranking evidence.
- `tests/recall/boundaries-and-stale.test.mjs` — ambiguity, automatic selection,
  archived exclusion/opt-in, Workspace isolation, stale guidance, and genuine
  no-result evidence.
- `tests/recall/cli.test.mjs` — candidate JSON, reranked answer, note link, and
  absolute-path non-disclosure evidence.

The tests create real Markdown Work Libraries under the operating system's
temporary directory and inspect the public API/CLI. No network or live
credential is used. No HTML artifact changed in Gate 6.

## Judgment for review

- Used the operative whole-gate instruction over the runbook snapshot's older
  one-obligation wording, consistent with the Gate 2 audit's F7 resolution.
- Chose a disposable in-memory lexical index rebuilt from authoritative
  Markdown on every Recall. V1 libraries are local and expected to be small;
  this keeps retrieval portable and avoids new runtime dependencies or stale
  machine state. The candidate limit is bounded at 50 and defaults to 12.
- Weighted titles/headings and paths above bodies, with metadata between them.
  At least one original term or two expanded terms must match and the record
  must cross a score threshold, which preserves paraphrase recall without
  making every query return an answer.
- Kept query expansion deliberately explicit and small. The active agent, not
  the lexical scorer, owns final semantic reranking; the two-pass ID allowlist
  makes that judgment observable and prevents evidence injection.
- Used `updatedAt` as a Knowledge Note's time-filter date and `occurredOn` for a
  Worklog Entry. Durable knowledge is not an event; its latest meaningful
  revision is the most useful interpretation of a Recall time filter.
- Generated note links only from paths relative to the Work Library. Captured
  records currently persist source IDs but not a dereferenceable source-locator
  registry, so candidate metadata returns those IDs without inventing links.
  The answer always links the supporting Markdown record and never exposes the
  library's raw absolute path.
- Treated `supersedes` and `updates` relationships as load-bearing current-over-
  old signals. Agent reranking cannot put an older target ahead of its retrieved
  successor, and unrelated current records remain independently rerankable.
- Allowed explicit selection of multiple Workspaces because the PRD permits
  cross-Workspace retrieval only when requested. An omitted selection never
  crosses boundaries: one active Workspace is automatic; more than one yields
  a clarification with zero candidates.
- Did not touch the renderer. The full browser suite was rerun through the Gate
  6 oracle, but new screenshots would not provide evidence for a retrieval-only
  change.

## Unresolved risks and next gate

- Query expansion is English-focused and intentionally small. Agent reranking
  improves ordering but cannot recover a candidate that has no lexical or
  expanded-term overlap. The contract explicitly defers FTS/embeddings until
  measured failures justify them.
- Source IDs remain grounded metadata rather than dereferenceable original
  source links when Capture did not persist a locator. Recall links the
  authoritative Work Library record; a future source registry must preserve the
  creator-only/export boundary if added.
- The current implementation rebuilds the index for each query. That is the
  safest V1 default; a very large library may later justify a disposable cache
  after profiling.
- Cross-platform behavior is exercised only on the current native macOS host.
  Native Linux and WSL2 clean-host proof remains Gate 9.
- Carried audit items remain: review live reload still relies on `fs.watch`
  portability (F14), five visualization families lack screenshot baselines
  (F11), and Gate 10 still owns the delimiter-adversarial path/secret tests,
  `.npmrc`, package privacy, dependency/license, and release reviews.

**Commit intent:** `feat: implement Gate 6 Recall`.

**Next gate:** Gate 7 — Deep Dive. Begin with a failing substantive
`test:deep-dive` suite for a purpose-bounded flow that reuses the existing report
schema, evidence contracts, and renderer; adds greater evidence depth and a
second valid visual composition; and verifies Deep Dive evidence placement and
reading behavior without a parallel model or renderer fork. Do not begin Gate
8.
