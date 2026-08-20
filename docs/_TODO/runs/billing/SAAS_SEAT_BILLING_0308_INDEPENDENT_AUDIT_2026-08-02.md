> **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is preserved only as historical evidence; it is not runnable or current guidance. Other content in this document is unchanged. See [the current B0 retirement rule](/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md).

# SaaS seat billing 0308 — independent audit — 2026-08-02

## Authority and boundary

- Authority brief: `docs/_TODO/runs/briefs/SAAS_SEAT_BILLING_0308_BRIEF.md`.
- Product oracle: `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a/5.1 and
  `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md`.
- Candidate head: `2f91ad58669a66eecb3e5806c84e0a626287bd69`.
- The worktree HEAD was a later merge, but this command proved that the only post-candidate differences were audit
  coordination documents, not candidate product/tests:

```bash
git diff --name-status 2f91ad586..HEAD
# M docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md
# A docs/_TODO/runs/briefs/SAAS_SEAT_BILLING_0308_AUDIT_BRIEF.md
```

- This report and the blind kill-set below were created before reading candidate-added tests.
- Worker reports and pre-existing green results were not treated as evidence.
- No product fix, push, DEV/TEST migration, deploy, or PROD action was performed.

## Blind kill-set (recorded before reading candidate tests)

1. The first confirmed tariff payment moves a pending/NULL period to an active/paid period and atomically ends the
   trial; an early renewal does not move the boundary before the paid period begins.
2. A seat invoice does not expand capacity before capture; the first capture adds the persisted quantity exactly
   once, while replay with the same or a different provider event adds nothing and changes no
   tariff/status/period/snapshot state.
3. A full confirmed refund reduces allowance exactly once; a partial seat refund is rejected; existing specialists
   are not removed and only new growth is blocked.
4. An invite at exhausted capacity creates/sends nothing and returns the server-side price; checkout rechecks
   organization usage/capacity/price, a request key creates one invoice and one PSP intent, and an unusable draft is
   retried.
5. A normal invite succeeds after payment; two concurrent invites for one paid seat yield exactly one success; the
   accept overlay does not treat price presence as payment.
6. Renewal amount equals base plus paid quantity multiplied by the current unit price, and the snapshot persists
   quantity; a missing unit price with positive allowance fails before any provider side effect.
7. Team return/poll/replay and Billing overview let a human complete payment; loss of browser state does not lose
   purchased shared capacity; platform breakdown distinguishes payment kinds.
8. There is one capture state machine and one subscription-to-invoice lock order; old promotion doors have no
   product callers. Client organization/amount/currency values are not authoritative.
9. Migration 0308 deterministically backfills only the exact legacy prefix, adds checks/partial indexes and a
   collision-free journal entry; it adds no table, route, payment adapter, receipt/fiscalization, or environment
   mutation.

## Verdict

**FAIL.** Six required product faults remained green. The required binary gate says every named class must be caught;
restored-candidate green checks do not override an uncaught fault.

The aggregate is the literal result of this command over the eight rows in the fault table:

```bash
printf '%s\n' uncaught caught uncaught uncaught uncaught uncaught caught uncaught | sort | uniq -c
#       2 caught
#       6 uncaught
```

## Finding F1 — PostgreSQL smoke executes a hand-written model, not the product Drizzle paths

**Reachable scenario and impact.** A normal code change can disable seat capture, omit pending/paid capacity, omit
renewal seat money, remove the invite lock, or reject the first tariff payment while the focused tests and the
mandatory PostgreSQL smoke remain green. Those regressions respectively lose purchased capacity, oversubscribe a
clinic, undercharge renewal, or leave the first payment unable to open access. Candidate acceptance therefore cannot
support money/concurrency `PASS`.

**Evidence.** `check-c4a-843-clinic-invite-concurrency.mjs:62-110` checks source substrings and then constructs its own
SQL for `createReplacingPending`. Lines 128-147 check more source substrings/order. Lines 532-668 separately implement
capture, renewal quote, and refund algorithms. The executed PostgreSQL scenarios validate those hand-written copies,
not `pgOrganizationInvites.createReplacingPending` or `pgSaasBilling`.

This is observable, not theoretical: the fault runs below changed the actual product ports while preserving the
strings the marker gate searches for. The smoke still printed claims such as `first tariff capture`, `renewal
arithmetic`, and `concurrency ... verified` and exited 0.

**Violated requirements.** Worker brief `Required oracle / fault classes` and `Boundaries, validation and delivery`;
owner audit brief's binary `PASS` rule; `AGENTS.md` §10b (oracle must not reproduce our implementation algorithm,
source-text checks are not behavioral tests, and every independent fault class needs a killing assertion); §24.5
(every named fault is caught or represented by a failing acceptance test).

## Fault injection evidence

Every mutation below was temporary and reverted immediately after its command. Mutations were phrased to preserve
the existing source-marker substrings where applicable, so the run tested behavior rather than exact text.

| Named class | Temporary product fault | Exact command and observed result | Result |
|---|---|---|---|
| Always-promote kind switch | `pgSaasBilling`: made the `seat_overage` branch unreachable with `&& false`, so the seat invoice fell into tariff promotion | `pnpm --dir apps/webapp exec vitest run src/modules/saas-billing/service.test.ts && node apps/webapp/scripts/check-c4a-843-clinic-invite-concurrency.mjs` → 24/24 and smoke `OK`, exit 0 | **UNCAUGHT** |
| Price-based accept | `organization-member-invites-rls.sql`: restored the legacy shortcut that accepts over-capacity when a unit price exists | `node apps/webapp/scripts/check-c4a-843-clinic-invite-concurrency.mjs` → exit 1, `legacy unpaid overage was accepted merely because a seat price exists` | caught |
| Pending-count | `pgOrganizationInvites`: multiplied the pending-invite contribution by zero | `pnpm --dir apps/webapp exec vitest run src/app/api/clinic/invites/route.route.test.ts src/app/app/settings/TeamSection.ui.test.tsx && node apps/webapp/scripts/check-c4a-843-clinic-invite-concurrency.mjs` → 7/7 and smoke `OK`, exit 0 | **UNCAUGHT** |
| Omit paid allowance from create capacity | `pgOrganizationInvites`: multiplied persisted paid allowance by zero | Same exact 7-test + smoke command as the preceding row → 7/7 and smoke `OK`, exit 0 | **UNCAUGHT** |
| Omit renewal seat component | `pgSaasBilling`: multiplied the renewal seat component by zero while retaining the marker expression | `pnpm --dir apps/webapp exec vitest run src/modules/saas-billing/service.test.ts && node apps/webapp/scripts/check-c4a-843-clinic-invite-concurrency.mjs` → 24/24 and smoke `OK`, exit 0 | **UNCAUGHT** |
| Missing decisive lock | `pgOrganizationInvites`: guarded the advisory lock by impossible `organizationId === ''` | `pnpm --dir apps/webapp exec vitest run src/app/api/clinic/invites/route.route.test.ts && node apps/webapp/scripts/check-c4a-843-clinic-invite-concurrency.mjs` → 3/3 and smoke `OK`, exit 0 | **UNCAUGHT** |
| Unusable draft replay | `saas-billing/service`: returned an existing draft before retrying the PSP | `pnpm --dir apps/webapp exec vitest run src/modules/saas-billing/service.test.ts` → exit 1; decisive assertion: `expected createIntent to be called once, but got 0 times` | caught |
| Reject first NULL-boundary payment | `pgSaasBilling.promotePaidInvoice`: rejected every subscription whose `currentPeriodEndsAt` is NULL | `pnpm --dir apps/webapp exec vitest run src/modules/saas-billing/service.test.ts src/app/api/clinic/billing/route.route.test.ts && node apps/webapp/scripts/check-c4a-843-clinic-invite-concurrency.mjs` → 31/31 and smoke `OK`, exit 0 | **UNCAUGHT** |

## View-only gates

- **Schema/migration/journal:** migration 0308 adds columns/checks and two partial unique indexes without a new table;
  the legacy classification is the exact prefix `Дополнительное место специалиста сверх тарифа — `; paid legacy
  quantity seeds subscription allowance; `invoice_kind` is NOT NULL with no permanent default. The journal entry is
  adjacent, unique, and selected by the journal gate.
- **Grants:** the new accept-overlay reads are covered by the earlier explicit
  `GRANT SELECT ON TABLE public.saas_billing_subscriptions TO app_owner` in migration 0286. The effective-tariff
  function is owned by `app_owner`; explicit runtime EXECUTE remains granted to `app_staff, app_patient` in 0295.
- **One state machine / no old promotion door:** exact product census:

```bash
rg -n "markSaasBillingInvoicePaid|activateSaasBillingSubscriptionPeriod|captureSaasBillingPaymentSucceeded" apps/webapp/src apps/webapp/scripts --glob '!**/*.test.*'
# ports.ts: one capture port declaration
# service.ts: one product call
# pgSaasBilling.ts and inMemorySaasBilling.ts: one implementation each
# no markSaasBillingInvoicePaid or activateSaasBillingSubscriptionPeriod product occurrence
```

- **No parallel product surface:** the only added file in the candidate is the reserved migration:

```bash
git diff --diff-filter=A --name-only 3ee522544f59b6c6679430bc17c7ad30eb433287..2f91ad586
# apps/webapp/db/drizzle-migrations/0308_saas_paid_seat_billing_local.sql
```

  The existing `/api/clinic/billing` POST is extended; no route, table, payment adapter, receipt/fiscalization code,
  or environment mutation is added. The bounded invite create transaction moved to the existing Drizzle port;
  existing unrelated legacy SQL methods were not expanded.

These view-only gates produced no additional product finding. They do not cure F1.

## Restored-candidate validation

All temporary product faults were reverted before this final run. `git diff --exit-code -- apps/webapp deploy`
returned 0 before the restored suite.

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/saas-billing/service.test.ts \
  src/app/api/clinic/billing/route.route.test.ts \
  src/app/api/clinic/invites/route.route.test.ts \
  src/app/app/settings/TeamSection.ui.test.tsx \
  src/app-layer/guards/cabinetAccessLadder.test.ts
# 5 files passed; 51 tests passed

node apps/webapp/scripts/check-c4a-843-clinic-invite-concurrency.mjs
# exit 0 (but F1 limits what this proves)

pnpm --dir apps/webapp exec tsc --noEmit
# exit 0

changed=$(git diff --name-only 3ee522544f59b6c6679430bc17c7ad30eb433287..2f91ad586 \
  -- 'apps/webapp/**/*.ts' 'apps/webapp/**/*.tsx' | sed 's#^apps/webapp/##')
pnpm --dir apps/webapp exec eslint $changed
# exit 0

bash apps/webapp/scripts/check-legacy-migrations-frozen.sh && \
  bash apps/webapp/scripts/check-drizzle-journal-sync.sh && \
  node scripts/check-saas-db-regression.mjs
# exit 0; journal sync OK; SaaS DB regression OK

node scripts/check-no-new-raw-sql.mjs
# exit 0; check-no-new-raw-sql OK

git diff --check 3ee522544f59b6c6679430bc17c7ad30eb433287..2f91ad586
git diff --check
# both exit 0
```

## Required next gate

F1 must be handed back to the worker: the existing disposable PostgreSQL smoke must exercise the actual product
Drizzle transactions (or equivalent acceptance tests must do so) and each of the six currently uncaught mutations
must make a decisive assertion fail. This report does not authorize or include that product/test-harness repair.
