# BIG-07 «Финансы» — Design Doc (Phase 1 / Investigation + Scaffold)

*Authored: 2026-06-17 by auto/big07-finances agent. Status: DRAFT FOR OWNER REVIEW.*

---

## 1. What already exists

### 1.1 Database — fully wired, no migration needed

| Table | Purpose | Rows (dev) |
|---|---|---|
| `patient_payment` | Doctor's manual ledger per patient: `kind=cash` (done) + `kind=acquiring` (plumbed) | 0 |
| `be_payment_intents` | Booking-engine prepayment intents | 0 |
| `be_payments` | Captured booking payments | 0 |
| `be_payment_history_events` | Full audit trail for booking payments | 0 |
| `be_payment_provider_events` | Raw webhook events from provider | 0 |
| `be_refunds` | Refund records linked to `be_payments` | 0 |

`be_appointments.payment_ref` (text) links an appointment to the capturing payment record.

**Two payment ledgers exist:**
- **`patient_payment`** — doctor's cash/acquiring register per patient (the "Учётка" ledger)
- **`be_payments` / `be_payment_intents`** — booking-engine prepayment ledger per appointment

### 1.2 Backend services — fully implemented

- `modules/patient-payments/service.ts` — `listPayments`, `listPaymentsWithSummary`, `addCashPayment`
- `modules/patient-payments/ports.ts` — `PatientPaymentsPort` + `AcquiringGatewayPort` (with `createCharge`, `refund`, `verifyWebhook`)
- `infra/repos/pgPatientPayments.ts` — Drizzle implementation
- `infra/payments/yookassaPaymentProvider.ts` — full YooKassa HTTP adapter
- `infra/payments/tinkoffPaymentProvider.ts` — full Tinkoff adapter
- `infra/payments/cloudpaymentsPaymentProvider.ts` — full CloudPayments adapter
- `infra/payments/alfabankPaymentProvider.ts` — full Alfa-Bank adapter
- `infra/payments/paymentProviderRegistry.ts` — factory by provider ID
- `infra/payments/registryAcquiringGateway.ts` — bridges `AcquiringGatewayPort` to provider registry
- `infra/repos/noopAcquiringGateway.ts` — noop (fallback when no keys)
- `buildAppDeps.ts` — wires `registryAcquiringGateway` for DB mode, `noopAcquiringGateway` for in-memory

### 1.3 API — fully implemented

- `GET /api/doctor/patients/[userId]/payments` — list + totalPaidMinor
- `POST /api/doctor/patients/[userId]/payments` — add cash payment
- Webhook: `POST /api/payments/webhook/[provider]` — existing booking-engine webhook handles all providers

### 1.4 UI — payments already shown in «Визиты» tab (PatientTabRecords)

`PaymentsPanel` is embedded at the bottom of `PatientTabRecords`. It shows `patient_payment` ledger (cash + acquiring) with a form to add cash entries. Acquiring is stubbed with "Эквайринг — скоро" note.

### 1.5 Configuration plumbing — complete

Provider keys live in `system_settings.booking_payment_providers` (JSONB). Admin UI at `/app/doctor/admin` → Settings → «Платежи записи» (`BookingPaymentsSection`). Keys are never in ENV or hardcoded. Secret merge/redaction is already implemented in `bookingPaymentSettings.ts`.

---

## 2. What BIG-07 asks for

> "Финансы/платежи: отдельная вкладка «Финансы» в карточке пациента (способ оплаты из записи; сейчас не продумано)"

### 2.1 Витрина (display layer) — safe to build now

The dedicated **«Финансы»** tab should unify BOTH ledgers per patient in one place:

**Section A — Кассовый журнал (patient_payment)**
- List of cash + future acquiring entries (already fetched via existing API)
- Total paid (existing `totalPaidMinor` aggregate)
- Form to add cash payment (already in PaymentsPanel — to be moved here from «Визиты»)

**Section B — История предоплат из записей (be_payment_history_events)**
- Per-appointment prepayments via booking engine
- Status: `pending` → `captured` → refunded
- Linked appointment date + service name

**NEEDS-OWNER-1:** Should the two ledgers be unified visually (single chronological timeline) or shown as two separate sub-sections? Currently they are separate tables with different schemas.

**NEEDS-OWNER-2:** Should «Финансы» tab **replace** the PaymentsPanel in «Визиты» tab, or coexist? (Currently PaymentsPanel lives in PatientTabRecords; moving it to Финансы and removing from Визиты is the clean approach per UCH-02.)

### 2.2 Эквайринг (acquiring flow) — Variant B

Owner decision: **real acquiring**. Provider = **YooKassa** (recommended: widest Russian market adoption, well-documented sandbox).

**Flow (doctor-initiated charge):**
1. Doctor enters amount + description in «Финансы» tab → clicks «Отправить ссылку на оплату»
2. Backend: `acquiringGateway.createCharge(...)` → YooKassa creates payment → returns `redirectUrl` (confirmation_url)
3. Backend writes `patient_payment` record (`kind=acquiring`, `status=pending`, `providerPaymentId`)
4. Doctor sends `redirectUrl` to patient (copy to clipboard / via channel)
5. Patient pays → YooKassa webhook fires → existing `/api/payments/webhook/yookassa` → status updates to `paid`

**NEEDS-OWNER-3:** The existing webhook route processes **booking** payments. It needs a path to also update `patient_payment` records when a direct-charge webhook fires. Currently `registryAcquiringGateway.verifyWebhook()` throws `use_booking_webhook_route_for_verification`. **The webhook handler needs extension for patient-payments acquiring.** This is backend work that requires owner decision on whether to extend the booking webhook handler or create a separate `/api/payments/patient-charge-webhook/[provider]` route.

**NEEDS-OWNER-4:** After acquiring charge is created, does the doctor copy the link manually, or should the system auto-send it via Telegram/MAX channel? The current `AcquiringGatewayPort.createCharge` only returns `redirectUrl` — delivery is up to the caller.

### 2.3 Sandbox keys — YooKassa official test mode

YooKassa publishes official **test (sandbox) credentials**. As of 2026, YooKassa provides:
- Test Shop ID: `100500` (example — owner must create account at yookassa.ru, get real test keys)
- Secret key: issued per account in the YooKassa dashboard under «Тестовый режим»
- All API calls to `https://api.yookassa.ru/v3/` work identically in test mode (no money movement)

**NEEDS-OWNER-5:** Owner needs to:
1. Register/log in at yookassa.ru
2. Enable «Тестовый режим» in the dashboard
3. Copy «Секретный ключ» + «ИД магазина» from test mode
4. Set them in admin Settings → Платежи → YooKassa (shopId + apiKey fields) and set `enabled=true` + `defaultProviderId=yookassa`

No sandbox keys are provided in this scaffold — they come from the owner's account, not from public documentation.

---

## 3. What was scaffolded in Phase 1

### 3.1 New: PatientTabFinances component

`apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabFinances.tsx`

- Renders two sections: «Кассовый журнал» (patient_payment) + «Предоплата из записей» (be_payment_history placeholder)
- Reuses existing shared primitives (`doctorSectionCardClass`, `doctorSectionItemClass`, etc.)
- Cash form for manual entry (moved/duplicated from PatientTabRecords for now)
- Acquiring charge initiation form: renders UI but calls `POST /api/doctor/patients/[userId]/payments/acquiring-charge` → **STUB (404 until implemented)**
- **No live acquiring charge is possible until owner provides keys**

### 3.2 PatientCardClient — «Финансы» tab added

Tab added as 8th tab between «Учётка» and end. Tab ID: `finances`.

**NEEDS-OWNER-6:** UCH-02 tracking says PaymentsPanel should move OUT of «Визиты». Phase 1 does NOT remove it from PatientTabRecords — co-existence while owner validates the new tab. Owner should decide whether to remove from «Визиты» after reviewing.

### 3.3 What is NOT built (needs real keys / owner decisions)

- `POST /api/doctor/patients/[userId]/payments/acquiring-charge` route (needs NEEDS-OWNER-3 decision on webhook)
- Webhook handler extension for patient-payment acquiring status updates
- Booking-engine prepayment history section in «Финансы» (separate backend API needed — query `be_payment_history_events` per patient)
- Auto-send of payment link via bot channel
- Refund UI (refund port is implemented; no UI)

---

## 4. Open NEEDS-OWNER decisions (summary)

| ID | Decision |
|---|---|
| NEEDS-OWNER-1 | Unified timeline vs two sub-sections for two ledgers? |
| NEEDS-OWNER-2 | Remove PaymentsPanel from «Визиты» after «Финансы» tab is validated? |
| NEEDS-OWNER-3 | Extend booking webhook handler OR separate patient-acquiring webhook route? |
| NEEDS-OWNER-4 | Auto-send payment link via bot channel or doctor copies manually? |
| NEEDS-OWNER-5 | Owner provides YooKassa test keys via admin settings UI |
| NEEDS-OWNER-6 | When to remove PaymentsPanel from «Визиты» tab? |

---

## 5. Migration status

**NO NEW MIGRATIONS NEEDED.** `patient_payment` table exists (migration 0122). All `be_payment_*` tables exist. No schema changes required for Phase 1 scaffold.

NEEDS-MIGRATION: None for Phase 1. Future acquiring flow may need: a `patient_acquiring_charge` table or a column on `patient_payment` to track `redirect_url` and `expires_at` per charge — but this can use `patient_payment.provider_payment_id` + existing columns for now.
