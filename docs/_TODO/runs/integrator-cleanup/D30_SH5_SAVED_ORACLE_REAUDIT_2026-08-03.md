# D30 Ш5 — saved-oracle independent re-audit (2026-08-03)

Candidate: `0fad9aa696` + fixer `0a34719d6e`, branch `wt/trackd-d30-sh5`.
Audit branch: `wt/trackd-d30-sh5-reaudit`. Scope: the two saved MUST FIX findings plus the
existing Ш5 race/stable-event/B5c/scheduler/security gates. Product candidate was not edited.

## Verdict: PASS

Both saved findings are closed and both fixes were killed independently. No new product finding.
The temporary migration remains `9997_d30_operator_health_digest_queue_local.sql` and is absent
from `meta/_journal.json`, as required before root assigns the final sequential number at land.

## Saved findings

1. **Real egress policy: PASS.** `parseIntentFromPayload` validates and preserves
   `outboundMessageClass`/`outboundCapability`; the real `createDefaultDispatchPort` then applies
   `assertOutboundMessagePolicy` before adapter I/O. Exact worker test proves one valid
   `operator_security/operator_alert` digest reaches the fake provider once; missing/wrong markers
   become `OUTBOUND_MESSAGE_POLICY_DENIED`, unknown markers become `BAD_PAYLOAD`, and none reaches
   the provider. Existing dispatch/dev-redirect coverage for other message kinds remains green.

2. **Canonical global-admin web-push audience: PASS.** The PostgreSQL adapter selects only
   `platform_users.role='admin'`, `is_archived=false`, `is_blocked=false`,
   `merged_into_id IS NULL`. A new disposable-PostgreSQL oracle inserts an active admin, blocked
   admin, archived admin, merged admin, ordinary doctor and client; the repository returns only the
   active canonical admin. Downstream unit coverage excludes notification-disabled and
   unsubscribed admins. Clinic membership is not an audience source; only the canonical platform
   role port is wired through DI.

## Fault injection

- Temporarily removed preservation of both policy markers from
  `outgoingDeliveryWorker.ts`; command
  `pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts -t "preserves digest policy markers"`
  failed at the exact provider assertion: expected one call, received zero. Restored byte-for-byte.
- Temporarily removed `eq(platformUsers.role, 'admin')` from the PostgreSQL adapter; command
  `pnpm --dir apps/webapp exec vitest run --config vitest.postgres.config.ts src/infra/repos/pgGlobalAdminWebPushRecipients.postgres.integration.test.ts`
  failed because ordinary doctor/client rows entered the result. Restored; the same disposable run
  then passed `1 file / 1 test`.

## Verification

- `pnpm --dir apps/integrator exec vitest run src/infra/runtime/scheduler/fixedCadenceWake.unit.test.ts src/infra/runtime/scheduler/schedulerLockedTick.unit.test.ts src/infra/runtime/scheduler/schedulerDecisionGuard.test.ts` → `3 files / 15 tests` PASS.
- `pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts src/infra/adapters/dispatchPort.test.ts src/shared/devDeliveryRedirect.test.ts` → `3 files / 36 tests` PASS.
- `pnpm --dir apps/webapp exec vitest run src/app-layer/health/runOperatorHealthDigestTick.unit.test.ts src/app-layer/health/runIntegratorPushOutboxHealthGuardTick.unit.test.ts src/modules/operator-health/prepareOperatorHealthDigestDeliveries.unit.test.ts` → `3 files / 6 tests` PASS (stable event IDs, concurrent wake dedup, configured local slot/DST and B5c).
- `pnpm --dir apps/integrator typecheck && pnpm --dir apps/webapp typecheck` → PASS.
- App-scoped ESLint over every changed TypeScript file in `b36b6923c..0a34719d6e` → PASS.
- `node scripts/check-no-new-raw-sql.mjs && node scripts/check-db-chokepoint.mjs && node scripts/check-webapp-infra-import-boundary.mjs && node scripts/check-queue-port-boundary.mjs` → PASS; raw-SQL report says `production debt: 0`.
- `bash apps/webapp/scripts/check-legacy-migrations-frozen.sh && git diff --check` → PASS.
- `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` → expected pre-land red only:
  `9997_d30_operator_health_digest_queue_local.sql not in _journal.json`. This is the required
  temporary-number state, not a product finding; root must renumber/register it atomically at land.

No land, migration apply, DEV, TEST or PROD mutation was performed.
