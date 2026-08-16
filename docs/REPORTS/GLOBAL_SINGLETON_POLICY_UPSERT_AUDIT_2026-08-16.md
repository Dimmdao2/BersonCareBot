# Global singleton policy UPSERT audit — 2026-08-16

## Authority and blind kill-set (recorded before reading the new test)

Authority: `saas_trial_policy`, `saas_registration_tariff_policy`, and
`saas_paid_period_policy` are singleton rows keyed by immutable `key = 'global'`.
An INSERT may provide `key`, but conflict UPDATE must not require UPDATE privilege
on it. The exact grants intentionally omit `key` from UPDATE. A global admin must
be able to save an existing policy without broadening grants, RLS, or principals;
the audit trail before and after the save remains intact.

| ID | Independent fault to kill | Required evidence |
| --- | --- | --- |
| K1 | Any policy setter includes `key` in the conflict UPDATE set, so an existing-row save needs the deliberately absent UPDATE privilege. | Focused behavior test turns red when one setter is fault-injected with `key` in its update set. |
| K2 | A setter inserts a row without the immutable `key = 'global'` value, or with another value, so the singleton conflict target is not preserved. | Product-diff review and focused behavior assertion for each policy. |
| K3 | A mutable policy field is absent from a setter update, so editing that field does not persist on the existing singleton row. | Field-by-field comparison with policy schemas/contracts and focused behavior assertions. |
| K4 | The save path loses or bypasses the required audit before/after record. | Diff/code-path review and focused behavior assertion where the audit observation is exposed. |

The test has not been read at the time this kill-set was recorded.

## Result

**PASS** — no concrete reachable finding in the candidate change.

| ID | Result | Evidence |
| --- | --- | --- |
| K1 | PASS | Each setter sends `key: 'global'` only to `insert(...).values(...)`; its conflict `set` object excludes `key`. The exact generated `app_platform_settings` UPDATE grants omit `key` on all three tables. Fault injection adding `key` to the paid-period `updateValues` made the focused test fail at `onConflictDoUpdate` with `permission denied for column key`; the temporary product edit was reverted. |
| K2 | PASS | Each INSERT value object fixes `key` to `'global'`; all three schemas enforce the same singleton key with a primary key and `key = 'global'` check. |
| K3 | PASS | Update sets exactly match the mutable domain fields and the generated UPDATE grants: trial = `durationDays`, `discountWindowDays`, `startEvent`, `postTrialBehavior`, `postTrialTariffId`, `isActive`, `updatedBy`, `updatedAt`; paid period = `postPaidPeriodBehavior`, `postPaidPeriodTariffId`, `isActive`, `updatedBy`, `updatedAt`; registration tariff = `tariffId`, `updatedBy`, `updatedAt`. No intended mutable field was dropped; `createdAt` and `key` remain immutable. |
| K4 | PASS | Each setter still reads the existing `'global'` row before its UPSERT and calls the unchanged `appendAudit` with that `before` value and returned `after` value. `appendAudit` persists both in `admin_audit_log.details`; the test also observes one audit insert per save. |

## Test review and execution

The new test is a DB-free public-port behavior test, not a source-text test. Its fake DB applies the independently generated column-grant rule at the `onConflictDoUpdate` boundary, then the test observes the three public reads and three audit writes. It proves the named costly, silent regression: a global admin's existing-policy save would fail because PostgreSQL requires UPDATE privilege on every assigned conflict-update column.

`apps/webapp/vitest.config.ts` places this `*.test.ts` file only in the `fast` project (the `unit`, `route`, and `ui` includes do not match). Focused command and restored-candidate result:

```bash
pnpm --dir apps/webapp exec vitest --run --project=fast src/infra/repos/pgPlatformEntitlements.singletonPolicies.test.ts
# 1 test passed
```

Bounded fault injection (reverted before the final run): add `key: 'global' as const` to the paid-period `updateValues` object in `apps/webapp/src/infra/repos/pgPlatformEntitlements.ts`, then run the same command. It produced one failed test with:

```text
Error: permission denied for column key
… pgPlatformEntitlements.singletonPolicies.test.ts:94
… pgPlatformEntitlements.ts:786
```

This is one injection for the single independent regression class: any singleton setter assigning immutable `key` during conflict UPDATE. The three setters are all exercised by the one behavior test; the immutable insert key, mutable-field coverage, and unchanged audit payload are one-time state/diff checks rather than separate test classes.
