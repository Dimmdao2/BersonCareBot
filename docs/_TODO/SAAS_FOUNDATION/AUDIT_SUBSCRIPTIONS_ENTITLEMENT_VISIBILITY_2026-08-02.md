# Subscriptions entitlement visibility — independent audit (2026-08-02)

## Verdict: FAIL

Authority: `TARIFFS_PAYMENTS_ADMIN_PLAN.md` §«Исполнимый порядок сведения оставшихся продуктовых веток», item 5
and §«Живая проверка результата человека»; `MECHANICS_TABLE_FOR_OWNER.md` row «Абонементы пациентов».

Scope inspected: `wt/subscriptions-entitlement-visibility` against current
`feat/doctor-ui-rebuild` (`e458ad1d8`); no DB, server, DEV/TEST, or PROD action was performed.

## Blind kill-set and evidence

1. **Clinic cannot create or sell a new package in `disabled` or `read_only`.**
   `POST /api/doctor/booking-engine/patient-packages` returns 403 before the membership port in both states;
   the new route acceptance test fault-injected removal of its entitlement guard and both assertions turned red.
2. **Patient cannot buy through a direct request in `disabled` or `read_only`.**
   `POST /api/booking/memberships/purchase` returns 403 before the purchase port in both states; removing its
   guard made both assertions red.
3. **Full access preserves both sales flows.** Both route tests return 200 with a full-access resolver;
   a temporary resolver fault which denied `full_access` made both assertions red.
4. **Existing purchases remain visible and consumable after disablement.** This has two reachable failures below.
   The acceptance tests are intentionally left red on the original product; per the blind-audit protocol they
   are the handoff to the worker, not a product fix by the auditor.
5. **Payment gate.** The online purchase requires both `subscriptions` and `payments` only in the later combined
   payment acceptance. It was deliberately not claimed or tested here.

## Reachable findings

1. **Existing purchased memberships disappear when `subscriptions` is disabled.**
   `GET /api/booking/memberships` calls `requireEntitlementForRead(..., 'subscriptions')`, which returns 403 for
   `disabled`, before `listPatientPackagesForUser`. The same state hides the doctor card and patient booking
   surface and rejects the direct detail/read routes. A patient or clinic that already bought a package therefore
   cannot see it after the mechanic is turned off, contrary to both owner authorities. The acceptance case
   `route.route.test.ts` now reproduces this as expected 200 / actual 403.

2. **An existing purchased membership cannot be consumed in `disabled` or `read_only`.**
   `POST /api/doctor/booking-engine/patient-packages/[id]/consume` applies
   `requireEntitlementForMutation(..., 'subscriptions')` before `manualConsume`; it returns 403 and leaves a
   valid purchased package unusable. This is a direct doctor request, so hiding UI controls is not the only
   failure. The acceptance cases reproduce expected 200 / actual 403 for both lifecycle states.

3. **The submitted branch is not isolated to the subscriptions product delta.** The snapshot diff
   `feat/doctor-ui-rebuild..HEAD` contains 218 paths, including mailings-adjacent
   `apps/integrator/src/infra/runtime/worker/doctorBroadcastIntentMenu.ts`, booking-payment routes, and
   `modules/saas-billing/*`. These are outside the requested subscriptions audit boundary, so the branch cannot
   be accepted as a subscriptions-only delta. Inspection of the actual subscriptions commit (`71ec5d52e`) found
   no old partial subscription implementation from `wt/mailings-subscriptions-entitlements`; however the unrelated
   merged delta itself remains a concrete ownership-boundary failure.

## Commands and fault injection

- `pnpm --dir apps/webapp exec vitest --run --project=route src/app/api/booking/memberships/route.route.test.ts src/app/api/booking/memberships/purchase/route.route.test.ts 'src/app/api/doctor/booking-engine/patient-packages/[id]/consume/route.route.test.ts' src/app/api/doctor/booking-engine/patient-packages/route.route.test.ts`
  → 7 pass, 3 intentional acceptance failures (history after `disabled`; consumption after `disabled` and
  `read_only`).
- Temporary removal of the clinic-sale entitlement guard → its two denial assertions failed; reverted.
- Temporary removal of the patient-purchase entitlement guard → its two denial assertions failed; reverted.
- Temporary `full_access` mutation denial in `requireEntitlement.ts` → both full-access sales assertions failed;
  reverted.

No production code, data, migrations, live environment, payment stage, SaaS billing behavior, Track D, or
mailing behavior was changed by this audit.
