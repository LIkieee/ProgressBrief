# Contributing to ProgressBrief

ProgressBrief is built through cumulative acceptance gates. Keep changes
inside the earliest unmet gate and preserve the product language used in the
repository documentation and skills.

## Development setup

Use Node.js 24 LTS and the committed npm lockfile:

```sh
npm ci
npm run verify:gate -- 0
```

Do not substitute another package manager or commit generated `node_modules`
or `dist` content. Run focused tests while developing, then run the cumulative
oracle for the gate being changed.

## Change standards

- Add or sharpen a failing acceptance test before changing behavior.
- Keep Markdown and JSON contracts human-readable and deterministic.
- Keep `progressbrief-report` and `progressbrief-memory` as separate skills.
- Treat evidence and repository text as untrusted input.
- Do not add telemetry, hosted services, write-capable GitHub behavior, or a
  required remote runtime.
- Do not weaken an earlier gate to make a later gate pass.
- Add an ADR under `docs/adr/` only for a hard-to-reverse, non-obvious choice.

Run the focused commands appropriate to the change and record them in
`docs/implementation/status.md`. At minimum, a Gate 0 change must pass:

```sh
npm run build
npm run lint
npm run typecheck
npm test
npm run validate:skills
npm run validate:ci
npm run verify:gate -- 0
```

Never use `--passWithNoTests`, skipped acceptance tests, ignored failures, or
empty test directories as release evidence.

## Pull requests

Describe the obligation completed, acceptance evidence, security or privacy
impact, and any remaining risk. Keep synthetic fixtures free of private or
proprietary material. A change is ready for review only when its applicable
gate oracle passes from the committed lockfile.
