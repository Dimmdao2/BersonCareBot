# Independent audit — Ч3б QueuePort structural gate (#1082)

**Verdict: PASS.** Candidate `f79aa5d07` against `350f00dec` adds one AST gate,
`scripts/check-queue-port-boundary.mjs`, and puts it in both ordinary lint
scripts. It scans only production TypeScript under `apps/integrator/src`,
excludes `*.test.*`/`*.spec.*`, and permits the raw seam only in
`infra/db/repos/jobQueue.ts` and `infra/adapters/jobQueuePort.ts`.

## Independent one-shot self-test

Temporary `apps/integrator/src/auditQueuePortFixture.ts` files were added,
executed by the real gate, then deleted. Each required bypass made the gate exit
nonzero:

1. direct named import;
2. aliased named import through `./infra/db/repos/../repos/jobQueue.js`;
3. named re-export; and
4. `import()` of the raw repository.

The normalized relative spelling proves the resolver is path-based rather than
text-based; the alias was reported as `imports raw enqueueMessageRetryJob as
bypass`. A temporary QueuePort consumer passed. A temporary
`auditQueuePortFixture.test.ts` with the forbidden import also passed, proving
test sources are intentionally outside product-caller scanning. The checked
candidate itself passed with its sole adapter binding and repository
implementation present.

**Killed/uncovered:** 4/4 required static bypass classes killed; 0 uncovered
within Ч3б's production-TypeScript scope. Deliberately outside that scope are
test/spec files, non-TypeScript/generated output, and a computed runtime module
specifier; the integrator has no TypeScript path aliases (`apps/integrator/tsconfig.json`).

## Evidence

| Command | Result |
| --- | --- |
| `node scripts/check-queue-port-boundary.mjs --self-test` | PASS: built-in AST fixture check reports 4 bypass forms red and authorized cases accepted. |
| `node scripts/check-queue-port-boundary.mjs` | PASS on the restored candidate; PASS for the QueuePort and test-file positive fixtures; expected nonzero separately for all four temporary production bypass fixtures. |
| `pnpm --dir apps/integrator lint` with the temporary alias fixture | Expected nonzero after `eslint src`: gate reported the raw aliased seam. |
| `pnpm lint` with the temporary alias fixture | Expected nonzero: ordinary root lint ran its preceding gates, then `check-queue-port-boundary` reported the same bypass. |
| `pnpm --dir apps/integrator lint` after restoration | PASS: `check-queue-port-boundary: OK`. |
| `pnpm lint` after restoration | Root ordinary lint reached `check-queue-port-boundary: OK`; no temporary fixture remained. |
| `git diff --check 350f00dec f79aa5d07` | PASS. |

No temporary fixture or product-code mutation remains. No V9b, billing,
raw-SQL conversion, Track D, DB, DEV/TEST/PROD file was changed.
