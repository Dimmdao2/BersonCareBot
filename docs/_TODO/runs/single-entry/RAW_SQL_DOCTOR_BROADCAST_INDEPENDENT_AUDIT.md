# Independent audit — doctor broadcast SQL batch

**Verdict: FAIL** for candidate `eca66ee45` (`wt/sql-text-census`). Scope is only
`broadcastChannelCounts.ts`, `pgBroadcastAudit.ts`, and
`pgDoctorBroadcastDelivery.ts`.

## Blind kill-set

This list was made from the owner item and `DOCTOR_BROADCASTS.md` before reading
candidate tests:

1. Drizzle `.returning()` / `.select()` must produce the complete
   `BroadcastAuditEntry` formerly mapped from snake_case rows.
2. Channel counts retain distinct Telegram/MAX and push users plus the unmerged
   phone/email filters.
3. One commit writes audit, every queue job, and trimmed/deduplicated recipients;
   it retains JSON, `now()`, job order and counts.
4. A duplicate `event_id` and any queue-insert failure roll back all three writes.
5. Audit `append`/`list` retain mapping, ordering and default limit; notification
   policy is not changed.
6. The exact legacy-call and canonical census deltas are reached.

## Result

The new disposable-PostgreSQL acceptance test is
`apps/webapp/src/infra/repos/pgDoctorBroadcastDelivery.postgres.integration.test.ts`.
It reuses `vitest.postgres.config.ts`; no harness, schema, migration, port or
source-text test was added. Its temporary RLS disablement and fault trigger are
restored in teardown/finally inside the disposable clone.

The candidate fails both write paths before a caller receives an audit entry:

- `pgBroadcastAudit.ts:23` and `pgDoctorBroadcastDelivery.ts:27` still read
  `row.executed_at`, but Drizzle returns schema-shaped `executedAt`.
- `new Date(String(undefined)).toISOString()` throws `RangeError: Invalid time value`.

Concrete impact: a doctor cannot append an audit record or execute a broadcast
batch after this conversion; in the batch case the transaction rolls back, so no
audit, jobs, or recipients are delivered.

| Kill-set class | Evidence | Status |
|---|---|---|
| Complete returned audit row | PostgreSQL acceptance test red (`Invalid time value`) | missed |
| Channel count semantics | acceptance count fixture: TG 2, MAX 1, phone 1, email 2, push 2 | killed |
| Successful atomic batch / JSON / `now()` / recipients | acceptance test red at returned audit mapping | missed |
| Duplicate `event_id` rollback | acceptance fault test green | killed |
| Forced job-insert failure rollback | disposable trigger fault test green; trigger removed | killed |
| append/list order/default | append acceptance test red at same mapping fault | missed |
| Notification-policy change | candidate diff touches no policy/resolver files; read-only inspection | killed |
| legacy/census deltas | AST and broad-text measurements below | killed |

## Commands and evidence

```sh
pnpm --dir apps/webapp test:postgres -- src/infra/repos/pgDoctorBroadcastDelivery.postgres.integration.test.ts
# FAIL: target file 4 tests, 2 red; both are RangeError: Invalid time value.
# The same harness run also reported 3 existing files / 4 existing tests green.

pnpm --dir apps/webapp exec eslint src/infra/repos/pgDoctorBroadcastDelivery.postgres.integration.test.ts src/infra/repos/pgBroadcastAudit.ts src/infra/repos/pgDoctorBroadcastDelivery.ts src/infra/repos/broadcastChannelCounts.ts
# PASS

pnpm --dir apps/webapp typecheck
# PASS

node scripts/check-no-new-raw-sql.mjs
# PASS: check-no-new-raw-sql: OK (integrator manifest files: 7; webapp manifest files: 21)

# AST CallExpression census, excluding tests/specs:
# { candidateFiles: 75, invocationFiles: 74, semanticCalls: 528 }
# Baseline 77/538 -> 74/528.

# AST restricted to the three repositories:
# { legacyTargetCalls: 0 }
# Baseline 10 -> 0.

rg -l --glob '*.{ts,tsx}' --glob '!**/*.test.*' --glob '!**/*.spec.*' '\$[0-9]+' apps/webapp/src | wc -l
# 94; baseline 97 -> 94.

git diff --check
# PASS
```

No product fix was made. Handoff: map Drizzle's camelCase schema rows (or select
the needed aliases consistently) in both audit mappers, then rerun this same
acceptance test and gates.
