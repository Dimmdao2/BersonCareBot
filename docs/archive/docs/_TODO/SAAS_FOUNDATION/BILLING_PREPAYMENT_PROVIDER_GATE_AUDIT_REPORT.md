# B1.3 — независимый аудит раннего prepayment gate (#1057)

Дата: 2026-08-02

Product candidate: `3e6e536b0ef9a55d40acd69aadb5afa29ed93a5b`

## Вердикт

**PASS.** Active prepayment policy не сохраняется без mutation-доступа `booking_prepayment`, включённых
платежей и доступного default provider с credential pair. Existing active policy можно выключить; booking-time
`payment_provider_unavailable` остаётся последним рубежом.

Постоянно добавлены только три недостающие acceptance-проверки: успех active policy для своей услуги,
отказ для чужой услуги и переход уже active policy в `disabled`; также зафиксирован booking-time guard.
Product-код временно менялся только для fault injection и полностью восстановлен.

## Blind kill-set

Kill-set составлен по `SAAS_BILLING_PLAN.md` B1.3 до чтения тестов.

| # | Required behavior | Evidence | Verdict |
|---|---|---|---|
| 1 | GET returns `available:false` for denied tariff, disabled payments or unusable default provider; no secret leaves the response | Route combines the shared mutation availability and `payments.getPrepaymentAvailability`; response contains only policies and `{ available, reason }`. Service tests cover disabled payments and missing credential pair. | PASS |
| 2 | PUT non-disabled policy refuses before write for tariff/provider/payment failures; disabled remains writable | Route acceptance asserts no `upsertPrepaymentPolicy` call for tariff and provider denial, and successful disabled write. | PASS |
| 3 | Available clinic persists active policy; service ownership guard remains | Added route acceptance for own service success and foreign-service `404` without write. | PASS |
| 4 | UI names the reason, cannot enable/save active policy, and can disable an existing active policy | UI acceptance covers provider message, blocked active save, unavailable active option retaining disabled mode, and active → disabled transition. | PASS |
| 5 | Booking-time `payment_provider_unavailable` is the final guard | `createAppointmentPaymentIntent()` still calls `resolveActiveProvider()` after enabled check; added service acceptance for missing credential pair. | PASS |
| 6 | Entitlement and credentials use existing doors only | `getMechanicMutationAvailability()` shares `checkEntitlement`; payments reuses existing `loadSettings()` and `resolveActiveProvider()`. Candidate adds no table, endpoint or config parser. | PASS |

## Fault injection

Every product mutation below was reverted before the final validation.

| Independent fault | Red oracle |
|---|---|
| Skip `payments_disabled` return in `getPrepaymentAvailability()` | Fast service test expected `payments_disabled`, received `payment_provider_unavailable`. |
| Continue after denied `requireEntitlementForMutation()` | Route tariff-denial test expected its `403` response, received `200`. |
| Invert provider availability branch in PUT | Route provider-denial test expected `409`, received `200`; active-save acceptance expected `200`, received `409`. |
| Remove `service.organizationId` comparison | Foreign-service test expected `404`, received `200`. |
| Remove the UI active-save disable condition | UI test expected Save disabled for loaded active policy, received enabled button. |
| Change shared provider error to another code | Fast service suite red for both missing-credential availability and booking-time final guard. |

No named fault remained uncaught.

## Architecture inspection

`git diff --name-only 3e6e536b0^ 3e6e536b0` shows the candidate changes only the entitlement adapter,
payments service, prepayment route/UI and their tests, plus the authority plan. No schema/migration/config-storage
file is in the candidate.

`apps/webapp/src/app/api/admin/booking-engine/prepayment-policies/route.ts` uses the existing
`requireEntitlementForMutation` door for writes and the non-clearing shared availability adapter for GET.
`apps/webapp/src/modules/payments/service.ts` uses the pre-existing config reader through `loadSettings()` and
the same `resolveActiveProvider()` credential-pair rule used when booking creates an intent. There is no second
credentials endpoint, table or parser.

## Final validation

```text
pnpm --dir apps/webapp exec vitest run --project fast src/modules/payments/service.test.ts
→ 1 file, 7 tests passed

pnpm --dir apps/webapp exec vitest run --project route src/app/api/admin/booking-engine/prepayment-policies/route.route.test.ts
→ 1 file, 6 tests passed

pnpm --dir apps/webapp exec vitest run --project ui src/app/app/settings/BookingPrepaymentSection.ui.test.tsx
→ 1 file, 3 tests passed
```

Scoped ESLint, webapp typecheck and `git diff --check` are recorded with the audit commit after the final
restored tree is validated.
