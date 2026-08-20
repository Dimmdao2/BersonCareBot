# D10 transport removal — stage 2 (2026-08-20)

## Zero-consumer proof before deletion

Commands run from the repository root:

```bash
node /home/dev/brain/tools/code-search.mjs "stubIntegratorDrizzleForTests" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "/api/integrator/events" --repo bcb -k 30
node /home/dev/brain/tools/code-search.mjs "ingestErrorClassification" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "projection-health" --repo bcb -k 30
```

The index returned the source definition of `stubIntegratorDrizzleForTests.ts` and historical/documentation hits, but no importing caller. It returned the webapp events route, its module/tests and the projection health proxy/digest graph; its remaining hits were historical documentation or the table/grant package, which is deliberately outside this stage.

Exact caller census:

```bash
rg -n -F 'stubIntegratorDrizzleForTests' . --glob '!node_modules/**' --glob '!dist/**' --glob '!apps/integrator/src/infra/db/stubIntegratorDrizzleForTests.ts'
```

Actual output contained only documentation/history:

```text
docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:540: ...stubIntegratorDrizzleForTests.ts...ноль вызовов...
docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md:1515: ...stubIntegratorDrizzleForTests.ts теперь ноль вызовов...
docs/_TODO/runs/integrator-cleanup/D20_INTEGRATOR_MAP.md:372: ...stubIntegratorDrizzleForTests.ts теперь ноль вызовов...
docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md:19: ...stubIntegratorDrizzleForTests.ts...
```

Those are doc comments/history, not callers. The exact webapp/source census was:

```bash
rg -n -F -e '/api/integrator/events' -e 'modules/integrator/events' -e 'ingestErrorClassification' -e 'handleIntegratorEvent' -e 'integratorEvents' apps/webapp/src
rg -n -F -e 'projection-health' -e 'projectionHealth' apps/integrator/package.json apps/integrator/scripts deploy scripts --glob '!deploy/postgres/privileges/**'
```

It located only the removed route/module/tests/CSRF test and the projection health proxy, digest, release-gate, package and deploy-doc consumers. `stableStringifyForIdempotency` had two non-transport callers (`messengerPhoneBindRequestHash.ts`, `pgManualPatientCommand.ts`), so it was retained as the shared serializer.

## Removed

### A. Webapp consumer and projection-health surfaces

- `/api/integrator/events`, its route test, events module, ingest classification, CSRF exception and protected-action registry entry.
- Event-only semantic hash wrapper/tests and semantic event hashing; retained `stableStringifyForIdempotency` with neutral documentation.
- The webapp projection health proxy, all three proxy routes, admin/critical health probe, projection digest debounce, settings/UI and archive controls that consumed `projection_outbox`.
- Tests solely covering those surfaces; adjacent shared health tests were updated to remove the retired input.

### B. Stage-1 leftovers

- `apps/integrator` projection-health npm commands and wrapper script.
- Stage 4/6/7/9/11 release-gate invocations and comments.
- Projection endpoint references in deploy env/host docs and the operational readiness check.

### C. Dead test scaffold

- `apps/integrator/src/infra/db/stubIntegratorDrizzleForTests.ts` after the exact and indexed zero-caller proof above.

## Deliberately kept

- `apps/integrator/src/infra/db/schema/integratorQueues.ts` and `integrator.projection_outbox`: no migration was written or applied.
- Shared idempotency, `stableStringifyForIdempotency`, outgoing delivery and direct-public retry queues/workers, and unrelated HTTP calls.
- `deploy/postgres/privileges/**` and all webapp Drizzle migrations were untouched.

## Checks

| Command | Exit | Actual result |
| --- | ---: | --- |
| `pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json` | 2 | Existing missing workspace modules: `drizzle-orm`, `drizzle-orm/pg-core`, and `pg` from `packages/platform-merge`. The same command on parent `d2cfae34d8ac3522417b5fac4c1fe20e8e14e659` also exited 2 with those eight errors. |
| `pnpm --dir apps/webapp exec vitest run src/modules/integrator src/middleware src/app-layer/health src/modules/operator-health` | 0 | 10 files, 31 tests passed. |
| `pnpm exec eslint apps/webapp/src --max-warnings=0` | 2 | Exact requested command: ESLint reports `apps/webapp/src` ignored from the root configuration. |
| `pnpm --dir apps/webapp exec eslint src --max-warnings=0` | 1 | Two pre-existing warnings in `AppointmentPaymentSection.tsx` (missing hook dependency, `<img>`); no errors. |
| `pnpm --dir apps/integrator exec tsc --noEmit -p tsconfig.json` | 0 | Passed. |
| `pnpm --dir apps/integrator exec vitest run` | 0 | 97 passed files, 495 passed tests, 2 expected-fail, 15 skipped. |

## NOT DONE

- The later, separate package must drop `integrator.projection_outbox` and only then remove its Drizzle declaration/grants. This stage did not touch the database or migrations.
