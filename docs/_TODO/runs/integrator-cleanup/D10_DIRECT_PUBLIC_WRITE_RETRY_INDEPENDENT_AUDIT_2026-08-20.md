# D10 direct-public retry — independent auditor-live report

**Candidate:** `b8511ce7e91f834ab6b82924136e18e2bb7a6448`

**Authority:** `WORK_ORDER.md` D10 and rule 5.1.4. The two failed direct-public writes must remain durable
without restoring the retired HTTP projection transport; shared delivery queues and idempotency remain intact.

**Verdict:** **FAIL**

## Blind failure list and result

| # | Failure | Evidence | Result |
|---|---|---|---|
| F1 | The direct writer fails, the fallback repository returns without inserting a durable row, and the event is silently lost. | Temporary fault injection made `enqueueDirectPublicWriteRetry` return without executing its `INSERT`; both candidate files stayed green (`2 files / 4 tests`). | **MISSED** |
| F2 | A persisted retry cannot acquire the runtime DB capability, so reclaim/claim never runs and every row remains pending forever. | Candidate source `worker:direct-public-write-retry-tick` is absent from both runtime allowlists and `INTEGRATOR_DELIVERY_SOURCES`. Added acceptance test calls the real worker tick and observes `Unknown integrator infra source in port-context mode: worker:direct-public-write-retry-tick` before its first query. | **MISSED / candidate defect** |
| F3 | A successful replay is not marked done. | Existing worker test requires `completeDirectPublicWriteRetry`. | **Covered by call-level unit test; no repeat mutation** |
| F4 | A transient replay failure is dropped instead of rescheduled. | Existing worker test requires reschedule and forbids completion. | **Covered by call-level unit test; no repeat mutation** |
| F5 | A crashed `processing` claim is stranded. | Repository contains a stale-row reclaim query and the worker invokes it, but the candidate cannot reach either query because of F2. | **Blocked by F2** |
| F6 | The two writePort fallbacks still use projection HTTP/outbox. | Exact `rg` in `writePort.ts` found only the two new retry calls at the former fallback sites; remaining projection fanouts are other live D10 producers. | **PASS by inspection** |

Blind result: **0 killed / 2 missed** for the two independently exercised loss classes. F1 is missing test
coverage; F2 is a current product defect with a committed failing acceptance test. The existing `4/4` suite is
green but mocks the repository and infra-principal boundaries, so it does not prove durable persistence or worker
reachability.

## Finding

`apps/integrator/src/infra/runtime/worker/directPublicWriteRetryWorker.ts` enters
`worker:direct-public-write-retry-tick`, while `apps/integrator/src/infra/db/withClient.ts` and
`deploy/postgres/privileges/declaration.ts` do not classify that source. In locked mode checkout is rejected by
the infra-source allowlist; in port-context mode capability selection throws before the first reclaim query.
Consequently the new durable rows are never replayed, so the D10 replacement does not provide eventual direct
write reliability.

## Other checks

- Migration name follows `YYYYMMDDTHHMMSS_slug.sql`; its header has an object-presence `VERIFY`, the table has a
  unique idempotency key plus pending/processing/done/dead state, due/stale indexes, exponential reschedule and
  terminal dead state in code.
- **NOT DONE:** live DEV ledger/catalog confirmation that the migration remains unapplied. The sanctioned
  `bash deploy/host/migrate-dev.sh --preflight` stopped at `FATAL: DEV API env path guard failed` because this
  isolated worktree has no canonical DEV env files. No wrapper was bypassed, and `--execute` was not run.
- New DB access uses Drizzle `sql` fragments through `runIntegratorSql`/`DbPort`; no new raw `pg` client path.
- `feat/doctor-ui-rebuild` was not checked out, merged, pushed, or modified.

## Validation run by auditor

- `pnpm --dir apps/integrator exec vitest run src/infra/db/writePort.reminderRuleFallback.test.ts
  src/infra/runtime/worker/directPublicWriteRetryWorker.test.ts` before fault injection: `2 files / 4 tests`
  passed.
- The same exact command with the persistence no-op fault injected still reported `2 files / 4 tests` passed
  (**F1 missed**); production code was restored byte-for-byte afterward.
- `pnpm --dir apps/integrator exec vitest run src/infra/db/writePort.reminderRuleFallback.test.ts
  src/infra/runtime/worker/directPublicWriteRetryWorker.test.ts
  src/infra/runtime/worker/directPublicWriteRetryWorker.principal.unit.test.ts` after restoration:
  `1 failed / 4 passed` across 3 files; only F2 is red.
- Integrator typecheck and lint: PASS.
- `node deploy/postgres/privileges/generate-cli.mjs --check` and
  `node deploy/postgres/privileges/generate-cli.mjs --census`: PASS for DEV and TEST; generated SQL matches the
  declaration byte-for-byte and the latter command checked 219 ACTIVE relations across 3324 source files.
- Migration order/self-check: PASS.
