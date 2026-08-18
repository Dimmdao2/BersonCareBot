# Booking lifecycle contract — final re-audit (2026-08-17)

## Verdict

**PASS** for candidate `ff2831f8de6ea2b612b4c1868efae46a7c146955`
(declared parent `0082ff6d096c85ff0ae363cb37ddd9cf3d5d83f1`).

The two MUST FIX findings from audit commit
`1b17b7998a5159962f977e23e684f7afad581e76` are closed. No new reachable booking or
global-admin delivery regression was found.

## Authority and method

- Self-contained round-3 brief and prior FAIL report
  `docs/REPORTS/BOOKING_LIFECYCLE_CONTRACT_FINAL_AUDIT_2026-08-17.md` from audit commit
  `1b17b7998a5159962f977e23e684f7afad581e76`.
- Repository rules: `AGENTS.md` §5, §10/§10a/§10b and §24.4–§24.7.
- Audit only: no product fix, DB, DEV, TEST, PROD or external send.

The prior kill-set was reused: absent/blank tenant at type or runtime; organization dropped by a
caller or HMAC query; malformed/partial/non-array/invalid/blank admin M2M audience collapsed to an
empty success; genuine empty audience rejected; retry/dedup failure; direct DB fallback; changed
global-admin ownership or booking create/reschedule/cancel behavior.

## F1 — mandatory organization scope: PASS

- `DeliveryTargetsFetchOptions.organizationId` is required.
- `DeliveryTargetsPort.getTargetsByPhone` requires its options argument.
- The adapter trims organization identity and returns `null` before `fetch` when phone or tenant is
  absent/blank. The independent blank-tenant acceptance test is committed with this report.
- Exact production census:

```text
rg -n "getTargetsByPhone\(" apps/integrator/src --glob '!**/*.test.ts'
```

shows five call sites. Every call passes an explicit organization:

- `infra/adapters/contextQueryPort.ts:79,133` — required query organization;
- `integrations/bersoncare/bookingLifecycleRoute.ts:186` — signed lifecycle payload organization;
- `kernel/domain/executor/handlers/delivery.ts:114` — nonblank actor tenant;
- `kernel/domain/executor/helpers.ts:512` — nonblank organization extracted before the call.

When a generic executor lacks tenant context it does not call the signed target endpoint; it keeps
the existing phone delivery target instead. There is no default/global organization substitution.

Type fault injection replaced the reflective malformed-runtime call with a normal one-argument
call. Integrator typecheck then produced the required error:

```text
src/infra/adapters/deliveryTargetsPort.test.ts(105,23): error TS2554:
Expected 2 arguments, but got 1.
```

Runtime fault injection removed tenant trimming. The blank-tenant acceptance test turned red and
showed a signed URL without `organizationId`, proving the guard catches that fault.

## F2 — admin M2M tri-state: PASS

The webapp route and integrator decoder use the same wire shape:

```text
adminMessengerTargets.telegramUserIds: string[]
adminMessengerTargets.maxUserIds: string[]
```

Both fields must be present arrays. Every element must be a string whose trimmed value is nonblank;
accepted values are trimmed. Therefore:

- `{ telegramUserIds: [], maxUserIds: [] }` is a valid empty global audience;
- missing payload/field, partial payload, non-array field, non-string element, or blank identifier is
  `null`/unavailable;
- `loadAdminMessengerIdLists` turns unavailable into
  `admin_notification_targets_unavailable`; booking returns retryable 502 and releases durable dedup.

Fault injection weakened element validation to array-only. The blank-ID case turned red with
`{ telegram: [''], max: [] }` instead of `null`.

The endpoint still calls the webapp-owned global platform-admin target resolver and ignores an
organization query. The outgoing adapter still signs the exact dedicated GET path. Inspection found
no direct `platform_users`/`user_channel_bindings` query or `runIntegratorSql` fallback in the
integrator booking/admin-target path.

## Regression and validation evidence

```text
pnpm --dir apps/integrator exec vitest --run \
  src/infra/adapters/deliveryTargetsPort.test.ts \
  src/infra/operatorIncident/adminMessengerTargetsAvailability.acceptance.test.ts \
  src/infra/operatorIncident/operatorHealthAlertConfigIntegrator.adminTargets.test.ts \
  src/integrations/bersoncare/bookingLifecycleRoute.d14.test.ts \
  src/integrations/bersoncare/bookingLifecycleRoute.dedup.test.ts \
  src/integrations/bersoncare/bookingLifecycleRoute.portContext.test.ts \
  src/integrations/bersoncare/bookingLifecycleRoute.reminderPlan.test.ts
# 7 files, 67 tests passed

pnpm --dir apps/webapp exec vitest --run \
  src/app-layer/booking/emitBookingDeletedEvent.organizationScope.unit.test.ts \
  src/app/api/integrator/admin-notification-targets/route.route.test.ts
# 2 files, 3 tests passed

pnpm --dir apps/integrator test
# 84 passed files, 4 skipped; 425 passed tests, 2 expected-fail, 15 skipped

pnpm --dir apps/webapp run typecheck
# exit 0

node scripts/check-no-new-raw-sql.mjs && node scripts/check-webapp-infra-import-boundary.mjs
# exit 0; both gates OK
```

Targeted ESLint for every changed integrator/webapp production and test path exited 0.

`pnpm --dir apps/integrator run typecheck` still exits 2 only on three errors in
`src/infra/adapters/webappEventsClient.materializeWake.test.ts:37,41`. Exact ancestry proof:

```text
git diff --exit-code 0082ff6d096c85ff0ae363cb37ddd9cf3d5d83f1..ff2831f8de6ea2b612b4c1868efae46a7c146955 -- \
  apps/integrator/src/infra/adapters/webappEventsClient.materializeWake.test.ts
# exit 0
```

The unrelated typecheck blocker is inherited and does not change this booking-contract PASS.
