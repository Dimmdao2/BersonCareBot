# D10 — live verification of the ON CONFLICT grant fix (2026-08-20)

Candidate: `0454f668d` (`fix(db): grant delivery worker ON CONFLICT reads (#987)`).

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D10,
rule 5.1.4; `AGENTS.md` §24.4–24.5; and the three preceding D10 audit records.

## Blind kill-set (recorded before reading candidate tests)

1. The delivery worker's own-org `INSERT ... ON CONFLICT` succeeds for both
   `public.content_access_grants_webapp` and `public.reminder_delivery_events`
   under exactly the generated grants.
2. A retry whose `organization_id` differs from `payload.organizationId` remains
   rejected by RLS; the table-level `SELECT` grant must not reopen cross-tenant
   writes.
3. A matching retry with status `pending` or `dead` remains rejected by RLS.
4. The worker cannot read another organization's rows with a plain `SELECT` on
   either table; `FOR ALL` RLS must protect the newly granted table-level reads.
5. Generated grants stay byte-for-byte current and are limited to the two named
   tables and the `SELECT` operation required by `ON CONFLICT`.

## Result

**PASS.** Candidate `0454f668d` restores the two legitimate delivery-worker
`INSERT ... ON CONFLICT` paths and does not widen cross-organization reads or
writes. No product change or acceptance test was needed.

| Kill-set item | Classification | Evidence | Verdict |
| --- | --- | --- | --- |
| 1. Own-org `ON CONFLICT` | Repeatable behavior | Real DEV transaction under worker principal | PASS |
| 2. Cross-org retry | Repeatable behavior | Real DEV transaction; RLS `42501` on both tables | PASS |
| 3. Non-`processing` retry | Repeatable behavior | Real DEV transaction; RLS `42501` on both tables | PASS |
| 4. Foreign plain read | Repeatable behavior | Real DEV transaction; RLS returns `0` rows on both tables | PASS |
| 5. Generated scope | One-off declaration state | candidate diff, relation-access test, generator checks/census | PASS |

## Candidate inspection

`git show --format=fuller --find-renames 0454f668d --
deploy/postgres/privileges/relation-access.ts
deploy/postgres/privileges/relation-access.test.mjs` shows only two effective
privilege changes: full table `SELECT` for
`app_operational_delivery_worker` on `public.content_access_grants_webapp` and
`public.reminder_delivery_events`. The candidate does not alter any
`rev10_delivery_replay_*` policy. `git diff --check 0454f668d^ 0454f668d`
returned exit `0`.

## Live PostgreSQL proof

The named DEV baseline has already advanced since round 3: the two D10
migrations, the retry relation and both generated `rev10_delivery_replay_*`
policies are present. Replaying historical migration files would violate the
current B0 rule and would fail on the existing relation; no migration was
applied. The live proof therefore used the exact current generated grants and
policies on `bcb_webapp_dev`, in one transaction, using the canonical admin
socket and the actual integrator login/capability:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 \
  -d bcb_webapp_dev -v ON_ERROR_STOP=1 -f .d10-grant-fix-live-verify.sql
```

The temporary script inserted `processing`, cross-org/`dead`, and
non-`processing` retry fixtures, then called `app.begin_port_context` with
`bcb_dev_integrator` and the declared relation capability. It reported:

```text
worker_current_user=app_operational_delivery_worker
INSERT 0 1                         # content own-org ON CONFLICT
INSERT 0 1                         # delivery own-org ON CONFLICT
cross_content_sqlstate=42501       # RLS
cross_delivery_sqlstate=42501      # RLS
pending_content_sqlstate=42501     # RLS
dead_delivery_sqlstate=42501       # RLS
foreign_content_read_rows=0
foreign_delivery_read_rows=0
ROLLBACK
```

The command exited `0`. The two positive statements are the exact shapes used
by `executeDirectPublicWriteRetry`: content upsert with `ON CONFLICT
(integrator_grant_id) DO UPDATE`, and delivery append with `ON CONFLICT
(integrator_delivery_log_id) DO NOTHING`.

The required fault injection was also run in a separate rolled-back DEV
transaction: revoking only the new `SELECT` grants made those same two own-org
statements fail before RLS, proving that this live oracle kills the precise
regression fixed by the candidate.

```text
content_without_select_sqlstate=42501
delivery_without_select_sqlstate=42501
ROLLBACK
```

Rollback was independently checked after the live run:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 \
  -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT ...; ROLLBACK;"
```

It returned `retry_fixture_rows=0`, `content_fixture_rows=0`, and
`delivery_fixture_rows=0` for the `d10-verify-%` fixtures.

## Targeted validation

All commands exited `0`:

```bash
pnpm --dir apps/integrator exec vitest run \
  src/infra/db/repos/directPublicWriteRetry.unit.test.ts \
  src/infra/db/writePort.directProjectionFallback.test.ts \
  src/infra/db/writePort.reminderOccurrenceHistory.test.ts \
  src/infra/runtime/worker/directPublicWriteRetryWorker.test.ts \
  src/infra/runtime/worker/directPublicWriteRetryWorker.principal.unit.test.ts
# 5 files / 21 tests passed

node --test deploy/postgres/privileges/relation-access.test.mjs
# 41 tests passed

node deploy/postgres/privileges/generate-cli.mjs --check
# 4 generated artifacts match byte-for-byte

node deploy/postgres/privileges/generate-cli.mjs --census
# bcb_webapp_dev: 219 ACTIVE relations across 3331 source files

pnpm --dir apps/integrator typecheck
```
