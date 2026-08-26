# ProgressBrief implementation status

**Current state:** Gate 7 — Deep Dive passes. Gates 0–7 are implemented
cumulatively in the commit containing this status update. Gates 8–10 remain
unimplemented; Gate 8 fails honestly because `test:curate` is absent.

## Gate 7 obligations completed

1. Added a purpose-bounded Deep Dive proposal contract with explicit selected
   project scope, audience, purpose, reporting period, flexible section roles,
   grounded claims, and existing V1 claim kinds. The contract supports one
   project or a selected multi-project body of work without treating a Deep
   Dive as a long Snapshot.
2. Added substantive proposal invariants for Workspace isolation, selected-
   project scope, unique structure and claim keys, complete project coverage,
   resolvable section claims, evidence grounding, and exportable-content
   safety. The active agent may vary wording and structure while remaining
   inside these semantic boundaries.
3. Added a committed synthetic reconciliation Deep Dive proposal and golden
   source model derived from the same notes, screenshot, and recorded synthetic
   GitHub pull request used by the existing Snapshot pipeline.
4. Kept the persisted Deep Dive model on the existing
   `report.schema.json`, evidence bundle, semantic validator, export projection,
   stable IDs, renderer, visual primitives, and creator review path. No
   Deep-Dive-specific schema or renderer fork was introduced.
5. Added greater evidence depth: the measured result is corroborated by three
   source types, claim-to-source relationships stay structural, and the
   recorded pull-request source is summarized at the issue, implementation,
   tests, review, merge, and benchmark-check level available in the fixture.
6. Added a two-visual composition through existing visual families: a timeline
   communicates the decision path and a quantitative chart communicates replay
   duration. Both retain text/table equivalents and valid replacement options.
7. Added Deep-Dive-specific reading behavior inside the shared renderer.
   Section-local claim context resolves public evidence labels from source IDs,
   is expanded by default in reading view, and is hidden by the existing
   presentation-view control. Snapshot output remains byte-identical to the
   audited Gate 3 hash.
8. Expanded `progressbrief-report` instructions with purpose-led structure,
   selected-scope validation, corroboration, visual selection, and evidence-
   placement rules. Updated capability boundaries so the skill does not claim
   Curate, clean-host installation proof, or release proof.
9. Added seven substantive Gate 7 tests covering explicit mode/purpose
   resolution, flexible structure, scope and grounding negatives, shared-schema
   export, deterministic shared rendering, Snapshot non-regression, two visual
   families, greater source depth, required viewports, zero network requests,
   reading/presentation behavior, and automated accessibility.
10. Re-pointed the foundation falsifiability tripwire: Gate 7 is positively
    available, while every unbuilt Gate 8–10 fails at the next normative suite,
    `test:curate`.

## Files changed

- `src/report/deep-dive-invariants.ts`: validates purpose-bounded Deep Dive
  proposals against existing evidence and selected project scope.
- `src/report/types.ts`: adds Deep Dive section roles and proposal types while
  retaining the shared report-mode and structure types.
- `src/renderer/render-report.ts`: adds mode-conditional section-local claim
  evidence in reading view through the existing renderer.
- `src/index.ts`: exports the Deep Dive proposal validator and proposal type.
- `fixtures/deep-dive-reconciliation/agent-report-proposal.json`: committed
  evidence-led proposal.
- `fixtures/deep-dive-reconciliation/golden-report-model.json`: committed,
  schema-valid source model with two visualizations and deeper claim evidence.
- `fixtures/deep-dive-reconciliation/README.md`: records provenance and the
  shared-contract/shared-renderer boundary.
- `tests/deep-dive/flow.test.mjs`: purpose, scope, negative invariant, schema,
  semantic, and export coverage.
- `tests/deep-dive/rendering.test.mjs`: deterministic composition, exact
  Snapshot hash, viewport, offline, view behavior, and accessibility coverage.
- `package.json`: adds the real `test:deep-dive` runner. The dependency graph
  did not change, so `package-lock.json` did not require an edit.
- `tests/foundation/foundation.test.mjs`: positively asserts Gate 7 and requires
  every future gate to fail at `test:curate`.
- `skills/progressbrief-report/SKILL.md` and
  `skills/progressbrief-report/references/report-workflow.md`: define the
  implemented Deep Dive workflow and boundary.
- `README.md`: records Gate 7 capability, verifier, and suite.
- `docs/implementation/status.md`: this standalone handoff.

No persistent schema, Snapshot fixture, Work Library behavior, review server,
workspace-level snapshot, canonical history, or `supervisor/` file was
modified. The renderer change is conditional on `mode: "deep-dive"`; the
audited Snapshot output hash remains
`3c1188e833955ba7cb790df05bd369ba357d6c02cbd5a720161e94c62caea908`.

## Command and result ledger

### Required source, recovery, and audit inspection

- `pwd && rg --files -g 'AGENTS.md' -g '!progressbrief/node_modules' -g
  '!progressbrief/.git' . && find docs/adr supervisor -maxdepth 1 -type f
  -print | sort && git -C progressbrief status --short --branch 2>/dev/null ||
  true` — the initial chained discovery stopped after `rg` found no
  `AGENTS.md`; `pwd` confirmed the workspace root. No state changed.
- `find . -maxdepth 4 -type f -print` — passed; located the implementation
  repository, six ADRs, status, and audits through Gate 6.
- `wc -l outputs/PROGRESSBRIEF_PRD.md CONTEXT.md
  docs/IMPLEMENTATION_CONTRACT.md docs/LOOP_RUNBOOK.md docs/adr/*.md
  progressbrief/docs/implementation/status.md supervisor/AUDIT-*.md
  supervisor/PROGRESS.md supervisor/HALT.md` — passed; established complete-
  read bounds.
- `sed -n '1,220p' outputs/PROGRESSBRIEF_PRD.md`, `sed -n '221,440p'
  outputs/PROGRESSBRIEF_PRD.md`, and `sed -n '441,647p'
  outputs/PROGRESSBRIEF_PRD.md` — passed; read the PRD and all 18 acceptance
  criteria completely.
- `cat CONTEXT.md docs/IMPLEMENTATION_CONTRACT.md docs/LOOP_RUNBOOK.md
  docs/adr/*.md` — passed; read the canonical language, locked defaults,
  normative gate mapping, Gate 7 exit conditions, and all accepted trade-offs.
- `cat supervisor/AUDIT-gate0.md supervisor/AUDIT-gate1.md
  supervisor/AUDIT-gate2.md supervisor/AUDIT-gate3.md
  supervisor/AUDIT-gate4.md supervisor/AUDIT-gate5.md
  supervisor/AUDIT-gate6.md` — completed with output truncation in the combined
  view; follow-up individual reads covered the truncated audits.
- `cat supervisor/AUDIT-gate1.md` and parallel `cat
  supervisor/AUDIT-gate2.md` / `cat supervisor/AUDIT-gate3.md` — passed. Gate
  0 and Gates 4–6 were complete in the combined read; all prior audits were
  therefore read completely. The latest verdict was Gate 6 PASS with no
  required changes and an explicit instruction to preserve the shared schema,
  renderer, and Snapshot hash.
- `cat progressbrief/docs/implementation/status.md` — passed; confirmed Gate 6
  complete, Gate 7 next, and no recovery work.
- Parallel `git status --short --branch`, `git log --oneline --decorate -10`,
  and `find .. -name AGENTS.md -print` in the repository — passed; the tree was
  clean at audited commit `8cb14c5`, and no `AGENTS.md` applied.
- `wc -l package.json schemas/report.schema.json schemas/evidence.schema.json
  fixtures/snapshot-three-workstreams/golden-report-model.json src/report/*.ts
  src/renderer/*.ts src/contracts/*.ts skills/progressbrief-report/SKILL.md
  skills/progressbrief-report/references/*.md tests/report/*.test.mjs
  tests/browser/*.test.mjs tests/foundation/foundation.test.mjs src/index.ts` —
  passed; bounded the relevant implementation surface.
- `cat package.json src/report/types.ts src/report/resolution.ts
  src/report/structure.ts src/report/confirmation.ts` and `cat
  schemas/report.schema.json schemas/evidence.schema.json
  src/contracts/types.ts src/contracts/report-semantics.ts
  src/contracts/export-projection.ts src/contracts/schema-validator.ts
  src/contracts/revisions.ts src/contracts/ids.ts` — passed; read the report
  request and persisted-contract surfaces.
- `cat src/renderer/render-report.ts src/renderer/visualizations.ts
  src/renderer/assets.ts src/renderer/html.ts`, `cat
  skills/progressbrief-report/SKILL.md
  skills/progressbrief-report/references/product-boundary.md
  skills/progressbrief-report/references/report-workflow.md src/index.ts`, and
  `cat tests/report/confirmation-and-structure.test.mjs
  tests/report/golden-snapshot.test.mjs
  tests/report/proposal-invariants.test.mjs tests/report/resolution.test.mjs
  tests/browser/browser.test.mjs tests/browser/renderer.test.mjs
  tests/foundation/foundation.test.mjs` — completed; output truncation in the
  grouped view was followed by the targeted complete reads below.
- `cat fixtures/snapshot-three-workstreams/golden-report-model.json`, `cat
  src/renderer/visualizations.ts`, and `cat src/index.ts
  skills/progressbrief-report/SKILL.md
  skills/progressbrief-report/references/report-workflow.md
  skills/progressbrief-report/references/product-boundary.md` — passed;
  completely read the shared model, visual primitives, public API, and skill.
- `cat fixtures/snapshot-three-workstreams/input/github/pr-184.json
  fixtures/snapshot-three-workstreams/input/project-brief.md
  fixtures/snapshot-three-workstreams/evidence.json
  fixtures/snapshot-three-workstreams/agent-report-proposal.json` and `cat
  src/report/proposal-invariants.ts` — passed; completely read the reusable
  evidence/proposal fixtures and invariant pattern.
- `find fixtures/snapshot-three-workstreams -maxdepth 4 -type f -print` —
  passed; confirmed the exact source and fixture material available for reuse.

### Test-first implementation and focused repair

- `npm run test:deep-dive` after adding the fixture, runner, and acceptance
  tests — failed as intended: the production export
  `validateDeepDiveProposal` did not exist and the renderer produced zero
  section-local Deep Dive evidence containers. Two independent rendering
  assertions already passed, proving the test harness was live.
- `npm run test:deep-dive` after adding proposal types/invariants, the export,
  and mode-conditional evidence rendering — 6/7 passed. The remaining failure
  was a test wording mismatch (`18 minutes` versus the fixture's adjective
  `18-minute`), not an implementation defect.
- `npm run test:deep-dive` after making that assertion accept the two
  grammatically equivalent forms — passed 7/7 with 0 failures, 0 skipped, and
  0 todo.
- `cat README.md tests/foundation/foundation.test.mjs
  skills/progressbrief-report/SKILL.md
  skills/progressbrief-report/references/report-workflow.md` — passed; grounded
  the documentation, capability-boundary, and tripwire updates.
- `npm run lint` — passed.
- `npm run typecheck` — passed under strict TypeScript.
- `npm run test:foundation` — passed 4/4 with the Gate 7 positive tripwire and
  Gate 8–10 negative tripwire.
- `git diff --check` — passed.
- `git diff --stat`, `git status --short`, and a targeted `git diff -- ...`
  over every modified tracked implementation file — passed; the diff remained
  inside Gate 7 and no prior acceptance test was weakened.
- `npm run build` — passed before manual rendering.
- `node tmp/gate7-qa/generate.mjs` — passed; generated one HTML artifact and
  three full-page screenshots from the committed model.
- Visual inspection of `tmp/gate7-qa/presentation-1440x900.png`,
  `tmp/gate7-qa/reading-1280x800.png`, and
  `tmp/gate7-qa/mobile-390x844.png` at original resolution — passed; hierarchy,
  timeline, quantitative chart, disclosures, claim evidence, and mobile
  wrapping were legible with no clipping. The generator and outputs are ignored
  QA artifacts and are not release inputs.
- `npm run validate:skills` — passed for both canonical skills.

### Gate oracle and integrity checks

- `npm run verify:gate -- 7` — **passed cumulatively**. `npm ci`, build, lint,
  typecheck, 4 foundation tests, both skill validations, local CI validation,
  11 contract tests, 15 report tests, 10 browser tests, 7 review tests, 14
  library tests, 11 Recall tests, and 7 Deep Dive tests passed: 79 substantive
  tests total, 0 failures, 0 skipped, and 0 todo. Dependency installation
  reported zero vulnerabilities.
- `node scripts/verify-gate.mjs 8` — run twice to capture the explicit exit
  code; both failed honestly with rc=1 and `Gate 8 is not implemented: missing
  package scripts test:curate.`
- `../supervisor/check-tripwire.sh 8` — passed: a real `assert.throws` loop
  covers Gates 8–10 at `test:curate`, and Gate 7 has a positive
  `doesNotThrow` assertion. The test body was also read directly.
- `rg -n --glob '!node_modules/**' --glob '!dist/**' --glob
  '!.npm-cache/**' --glob '!docs/implementation/status.md'
  'test\.skip|it\.todo|describe\.skip|--passWithNoTests|\|\| true|continue-on-error:\s*true|process\.exit\(0\)'
  .` — the only match was the pre-existing prohibition in `CONTRIBUTING.md`;
  no verifier or test suppression exists.
- `npm audit --omit=dev` — passed with zero runtime vulnerabilities.
- Final parallel `cat schemas/report.schema.json`, `cat
  src/report/deep-dive-invariants.ts tests/deep-dive/flow.test.mjs
  tests/deep-dive/rendering.test.mjs`, and `cat
  fixtures/deep-dive-reconciliation/agent-report-proposal.json
  fixtures/deep-dive-reconciliation/golden-report-model.json
  fixtures/deep-dive-reconciliation/README.md` — passed; re-read the shared
  schema and every new production, acceptance, and fixture artifact before
  commit preparation.

## Artifacts and evidence

Committed, reproducible evidence:

- `fixtures/deep-dive-reconciliation/agent-report-proposal.json` — purpose and
  selected-scope proposal fixture.
- `fixtures/deep-dive-reconciliation/golden-report-model.json` — shared-schema
  Deep Dive source model.
- `tests/deep-dive/flow.test.mjs` — proposal, scope, grounding, shared-schema,
  semantic, and export evidence.
- `tests/deep-dive/rendering.test.mjs` — deterministic shared renderer,
  Snapshot hash, two-visual, source-depth, responsive/offline, view-mode, and
  accessibility evidence.

Ignored manual QA artifacts in this workspace:

- `tmp/gate7-qa/deep-dive.html`
- `tmp/gate7-qa/presentation-1440x900.png`
- `tmp/gate7-qa/reading-1280x800.png`
- `tmp/gate7-qa/mobile-390x844.png`

No network, live GitHub authentication, credential, or mutable external content
is required to regenerate the committed evidence.

## Judgment for review

- Kept Deep Dive proposal types separate from Snapshot proposal case-handling
  because the flows have different semantic invariants, while keeping both on
  the same persisted report/evidence contracts and renderer. This is an
  internal type boundary, not a second report schema or runtime pipeline.
- Modeled `selectedProjectIds` as a non-empty list instead of a single project
  so the same purpose-bounded contract supports either one project or a defined
  body of work. Every section and source must remain inside that explicit
  selection.
- Retained `reportingPeriod` in Deep Dive proposals and source models because
  the shared V1 report schema requires it. Purpose and selected scope, not the
  dates, determine the mode and structure.
- Reused the recorded synthetic reconciliation notes, dashboard, and pull-
  request fixture. The Deep Dive source summary exposes more of the already
  recorded PR metadata (linked issue, implementation/tests, review, merge, and
  benchmark check) rather than inventing a new adapter or live source.
- Used a timeline for the decision path and a quantitative chart for measured
  change. They communicate different relationships through existing renderer
  primitives and retain text/table equivalents.
- Added reading behavior conditionally inside `renderReport` rather than
  creating a Deep Dive renderer. Public evidence labels are resolved from the
  claim's stable source IDs and placed next to the claim; creator-only locators
  remain structurally absent.
- Added no shared CSS so Snapshot output remains exactly byte-identical. Deep
  Dive claim evidence uses existing semantic `<details>`, list, and small-text
  styling. Automated accessibility and original-resolution visual inspection
  both passed.
- Required section-local claim evidence to be open in reading view and hidden
  in presentation view. Ordinary component evidence drawers remain available
  in both views for concise inspection.
- Added no dependency, schema, CLI fork, report-model fork, or renderer fork.

## Unresolved risks and next gate

- The committed Deep Dive proves one engineering/operations decision-review
  scenario. Product, design, and research examples remain Gate 10 release
  content; the proposal roles are flexible enough to omit irrelevant modules.
- Public evidence is displayed by label beside claims, not as a clickable
  source URL. This preserves the creator-only locator boundary; future public
  source links would require an explicit safe export field rather than exposing
  raw locators.
- Cross-platform behavior is exercised only on the current native macOS host.
  Native Linux and WSL2 clean-host proof remains Gate 9.
- Carried audit items remain: review live reload still relies on `fs.watch`
  portability (F14); five visualization families lack screenshot baselines
  (F11); query expansion is English-focused (F17); and Gate 10 still owns
  delimiter-adversarial path/secret tests, `.npmrc`, package privacy,
  dependency/license, and release reviews.

**Commit intent:** `feat: implement Gate 7 Deep Dive`.

**Next gate:** Gate 8 — Curate. Begin with a failing substantive `test:curate`
suite for duplicate, contradiction, stale-note, missing-link, and broad-note
candidates; proposed merge, move, rewrite, relation, and supersession
operations; explicit approval before substantial mutation; reversible writes;
preserved history; and a rejection path that produces no mutation. Do not begin
Gate 9.
