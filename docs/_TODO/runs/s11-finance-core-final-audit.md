# PAY-REL-05 — финальный аудит финансового ядра

**Вердикт: FAIL.** На exact candidate найдены пять независимых денежных дефектов с падающими behavioral acceptance-тестами и один cross-scope дефект на границе retry. Production-код не исправлялся.

**Проверяемый candidate:** `c133fee8473fc3421d3999b9206e21593405563a`

**Authority:** `AGENTS.md` §§1, 5, 10a, 10b, 24; `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md` S10/S11 `PAY-REL-05`; `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §§13, 13.1, 19.

## Классификация «тест или взгляд» и результат

Классификация и blind kill-set были записаны до чтения существующих тестов. «Тест» означает повторяемое конечное поведение через самый дешёвый публичный слой; «взгляд» — одноразовую инспекцию итоговой структуры/diff без теста текста исходника.

| Пункт scope | Класс | Статус | Evidence |
| --- | --- | --- | --- |
| Наличная полная, частичная и предоплата без зависимости от онлайн-провайдера | ТЕСТ | **PASS** | `staffAppointmentPayments.s10.unit.test.ts`: все три назначения проходят без provider config; FI-1 и FI-8 убиты. Payment route: `11/11` зелёных тестов. |
| YooKassa: намерение/счёт, authenticity/refetch, успех/отмена, повтор webhook | ТЕСТ | **FAIL** | Intent/identity `29/29` PASS; authenticity/refetch `2/2` PASS и FI-2/FI-3 убиты; повтор webhook FI-4 убит. Refund invoice и terminal refund status падают: F1, F2. |
| Предоплата, полная/частичная оплата, отмена записи и удержание предоплаты | ТЕСТ | **FAIL** | Полная оплата с required prepayment `5 000` при цене `10 000` удерживает все `10 000` и не возвращает остаток: F3. При provider outage отмена уже committed, durable refund continuation отсутствует: F6. |
| Кассовый и provider refund, частичный возврат, сумма возврата, запрет двойного движения | ТЕСТ | **FAIL** | Cash/provider conservation, shared payment и concurrency защищены FI-5/FI-6/FI-9; invoice refund, terminal status, partial status и receipt нарушены: F1, F2, F4, F5. |
| Tenant/binding суммы, валюты, записи, пациента, организации и провайдера | ТЕСТ + ВЗГЛЯД | **PASS** | Создание передаёт provider внешние amount/currency/payer/purpose/subject, provider ref сохраняется на intent; `paymentProviderIdentity.unit.test.ts` и `patientAcquiring.route.test.ts` — `29/29`. Webhook refetch идёт credential-ами принятой организации, settlement ищет exact provider ref только внутри accepted tenant; org-query tests входят в зелёные `53/59`. Достижимого cross-tenant/provider обхода в diff не найдено. |
| Idempotency и конкуренция: один внешний факт не создаёт два платежа/возврата/удержания | ТЕСТ + ВЗГЛЯД | **PASS** | FI-4 (webhook replay), FI-5 (refund concurrency), FI-6 (shared payment link), FI-7 (retention replay) убиты; SQL settlement использует unique provider event + `ON CONFLICT`, payment unique by intent, удержание имеет business unique history key. |
| Сохранённые статусы, история и чеки соответствуют фактическим immutable движениям | ТЕСТ + ВЗГЛЯД | **FAIL** | Append-only payment/refund/history path сохранён, но `pending/canceled` refund записывается успешным, partial refund оставляет `captured`, partial fiscal receipt отсутствует: F2, F4, F5. |

## Blind kill-set

| ID | Поломка | Результат / evidence |
| --- | --- | --- |
| K01 | Cash зависит от онлайн-провайдера | **УБИТО FI-1:** provider guard в cash branch покраснил `S11 K11`. |
| K02 | Cash принимает неположительную сумму/сумму выше остатка | **УБИТО FI-8:** снятие upper bound дало `11 000` при долге `10 000`; `K1` покраснел. |
| K03 | Full/partial/prepayment проводится неверной суммой или преждевременно закрывает долг | **PASS:** конечный `manualPaidMinor/remainingMinor` проверяется S10-набором и route `11/11`; неверный upper bound убит FI-8. |
| K04 | Intent/invoice создан с неверным amount/currency/org/appointment/patient/provider binding | **PASS:** provider identity/route `29/29`, inspection единой `createAppointmentPaymentIntent`-двери. |
| K05 | Webhook body принят без authenticity/provider refetch | **УБИТО FI-2/FI-3:** снятие IP gate и подмена refetch телом покраснили новые webhook-тесты. |
| K06 | Refetch pending/canceled/mismatch всё равно проводит деньги | **ПОЙМАНО:** payment webhook берёт refetched status/amount; refund `pending/canceled` нарушает протокол — F2, два красных примера. |
| K07 | Provider success не создаёт ровно одно payment movement и canonical status | **PASS:** `providerWebhookSettlement.test.ts` зелёный, SQL settlement/history просмотрены. |
| K08 | Повтор success webhook создаёт второй payment/history/handoff | **УБИТО FI-4:** повторный compatibility wake покраснил `does not re-notify...`; DB unique/CAS просмотрены. |
| K09 | Повтор intent создаёт второй оплачиваемый счёт | **PASS (inspection):** local lookup до create + provider `Idempotence-Key` + unique local key; второго write-path не найдено. |
| K10 | Cancel без денег создаёт движение либо paid cancel использует неверный остаток | **ПОЙМАНО:** F3 и F6. |
| K11 | Частичная отмена shared payment возвращает всю сумму/ломает другой слот | **УБИТО FI-6:** возврат к старой связи `payment.appointmentId` покраснил refund второго слота. |
| K12 | Невозвратная часть считается на chain, а не по каждому слоту | **PASS:** lifecycle получает решение для конкретного appointment, payment share считается по конкретному слоту; shared-link regression убита FI-6. F3 отдельно показывает неверный размер удержания внутри одного слота. |
| K13 | Cash refund зависит от YooKassa или provider refund применяется к cash | **PASS:** cash refund идёт через patient-payment ledger; `K6` не допускает затем provider double refund. Invoice provider refund нарушен отдельно — F1. |
| K14 | Provider failure/cancel/pending записан как successful refund | **УБИТО/ПОЙМАНО:** FI-9 покраснил existing failure test; `pending/canceled` на исходном candidate дают F2. |
| K15 | Partial refund превышает доступный refundable balance | **PASS:** per-appointment history balance и serialized root; overcollection/double-refund набор зелёный. |
| K16 | Повтор/конкуренция refund/hold создаёт второе движение | **УБИТО FI-5 и FI-7:** снятие in-flight serialization дало локальные `6 000` при внешних `3 000`; снятие retention replay check дало два hold fact. |
| K17 | Чужая org/patient/appointment/payment допускает движение | **PASS:** org-scoped service tests, accepted-context DB root и exact appointment `payment_ref`; `pgPayments.providerWebhook.principal.unit.test.ts` зелёный. |
| K18 | Provider/account binding не соблюдается при webhook/refund | **PASS:** org-specific credentials + exact provider ref for capture; refund использует provider сохранённого payment. Invoice-ref conversion сломан, но не меняет merchant — F1. |
| K19 | Refund/hold переписывает исходный payment вместо компенсирующего факта | **PASS (inspection):** refund/retention добавляют `be_refunds`/history; исходный captured movement не удаляется. |
| K20 | Status/history/receipt не соответствует immutable movements | **ПОЙМАНО:** F2, F4, F5; четыре красных утверждения. |
| K21 | Payment success × expiry/cancel race оставляет orphan/double final state | **PASS (inspection):** candidate reconciliation повторно входит в canonical settlement root; `s11-payment-reconciliation-evidence.md` подтверждает terminal correction, SQL root использует conditional transitions. |

## Fault injection

Все мутации вносились только во временный production diff, тест запускался на переднем плане, затем мутация снималась. Итог: **9 независимых мутаций, 9 убито, 0 выжило**.

| FI | Временная поломка | Покрасневшее утверждение |
| --- | --- | --- |
| FI-1 | Cash branch потребовал available provider | `S11 K11: accepts prepayment, partial and full cash without an online provider` → `payment_provider_unavailable`. |
| FI-2 | Снят YooKassa sender-IP gate | `rejects a forged notification before trusting its body` вместо отказа дошёл до provider I/O. |
| FI-3 | Webhook normalize взял notification body вместо provider GET | `uses refetched provider status and amount...`: получил `payment.succeeded/10000` вместо `payment.canceled/2500`. |
| FI-4 | Любой duplicate с `paymentId` повторно запускал handoff | `does not re-notify...`: callback вызван `1` раз вместо `0`. |
| FI-5 | Снят in-flight refund serialization | `K3`: local remaining стал `6000` при реально возвращённых `3000`. |
| FI-6 | Shared payment снова искался через `payment.appointmentId` | `K4`: второй оплаченный слот получил `payment_not_refundable`. |
| FI-7 | Снят replay check для `prepayment_retained` | `S11 K5`: повтор одной отмены создал два hold event вместо одного. |
| FI-8 | Снят cash upper bound по остатку | `K1`: `manualPaidMinor=11000`, ожидалось `6000` после отказа второго платежа. |
| FI-9 | Ошибка provider refund была проглочена как success | `S11 K4`: promise resolved `{ok:true}` вместо rejection; успешный локальный факт стал достижим без внешнего возврата. |

## MUST FIX

### F1 — invoice refund отправляет invoice id как `payment_id`

- **Сценарий:** appointment prepayment со сроком создаётся через `/v3/invoices`, поэтому `be_payment_intents.provider_intent_ref = in-*`. После оплаты и отмены `refundAppointmentPaymentOnce` передаёт этот ref в `yookassaPaymentProvider.refund`, а adapter без разрешения invoice отправляет `payment_id: in-*`.
- **Impact:** YooKassa требует payment id из `invoice.payment_details.id`; refund не проводится после уже committed отмены, пациент остаётся без денег.
- **Authority:** PAY-REL-05 «YooKassa/refund/cancel»; официальный протокол YooKassa `scenario-extensions/invoices/refunds`.
- **Evidence:** падает `refunds the payment linked to an invoice rather than using the invoice id as payment_id`: получено `in-appointment-1`, требуется `payment-appointment-1`.

### F2 — HTTP 200 `pending`/`canceled` refund становится локальным `succeeded`

- **Сценарий:** `/v3/refunds` отвечает 200 с object status `pending` либо `canceled`. Adapter читает только `id` и возвращает success; service создаёт `be_refunds(status='succeeded')` и `refund_succeeded` history.
- **Impact:** immutable ledger сообщает, что деньги возвращены, хотя исход неизвестен или возврат отменён; повтор/операторское решение опирается на ложный факт.
- **Authority:** PAY-REL-05 «успех/отмена», «статусы/история соответствуют фактическим immutable движениям»; официальный YooKassa response handling.
- **Evidence:** два падающих случая `does not report a pending/canceled refund as successful`.

### F3 — `retain_prepayment` удерживает всю полную оплату и не возвращает остаток

- **Сценарий:** цена сеанса `10 000`, required/non-refundable prepayment `5 000`, пациент уже оплатил `10 000`. Late cancel с `prepaymentRetained=true` пишет retention на весь appointment share `10 000` и не вызывает refund остатка `5 000`.
- **Impact:** клиника удерживает на `5 000` больше owner-policy; пациент теряет оплаченный сверх предоплаты остаток. Для multislot ошибка повторяется по отменяемым слотам.
- **Authority:** `OWNER_PRODUCT_RULES.md` §13.1: удержание считается по каждому отменённому сеансу, возврат = стоимость отменённого слота минус его невозвратная часть.
- **Evidence:** падает `retains only the required prepayment and refunds the paid remainder...`: retained `10000`, требуется `5000`; refund remainder отсутствует.

### F4 — partial provider refund оставляет payment status `captured`

- **Сценарий:** captured payment `10 000`, successful refund `3 000`. Service меняет status только при cumulative refund `>= 10 000`; ветки `partially_refunded` нет.
- **Impact:** сохранённый status противоречит immutable refund movement; детали/аналитика видят полностью captured payment, хотя provider balance уже `7 000`.
- **Authority:** PAY-REL-05 «сохранённые статусы/история соответствуют фактическим immutable движениям».
- **Evidence:** падает `marks a provider payment partially_refunded...`: получено `captured`, требуется `partially_refunded`.

### F5 — partial YooKassa refund не передаёт обязательный fiscal receipt

- **Сценарий:** YooKassa payment создан с fiscal receipt (`fiscalVatCode` обязателен для active provider), затем выполняется partial refund. `refundAppointmentPaymentOnce` не передаёт `receipt` adapter-у, хотя port и adapter его поддерживают.
- **Impact:** для схемы 54-ФЗ partial refund либо отклоняется provider-ом после committed cancel, либо не создаёт соответствующий чек возврата; деньги/фискальный факт расходятся.
- **Authority:** PAY-REL-05 «чеки соответствуют фактическим immutable движениям», owner rule §19; YooKassa `receipts/54fz/yoomoney/refunds` требует `receipt` для partial refund.
- **Evidence:** падает `sends an amount-matched fiscal receipt...`: `receipt` отсутствует.

### F6 — CROSS-SCOPE: после committed cancel неуспешный refund не получает durable retry

- **Сценарий:** canonical cancellation уже committed; provider network/API временно падает. `runStaffManualCancelAfterCanonical` ловит ошибку и возвращает только `paymentOutcomeFailed`; route отдаёт flag, но `rg -n "paymentOutcomeFailed" apps/webapp/src` не находит потребителя в doctor UI или durable queue. Patient cancel так же ловит ошибку после commit. Повтор cancel уже упирается в terminal cancellation state.
- **Impact:** фактический refund может не произойти навсегда, хотя запись отменена; текущий successful-refund outbox создаётся только после success и не может восстановить сам request.
- **Authority:** прямое условие brief: достижимый денежный разрыв на исключённой retry/scheduler границе фиксируется как cross-scope finding.
- **Граница:** retry/reconciliation не исправлялись этим аудитором.

## Команды и результаты

- `git rev-parse HEAD` → `c133fee8473fc3421d3999b9206e21593405563a`.
- `git rev-parse 0c5a9aa2e^` → finance-history base `7963573a0b0692bc35a41243f447b84887d26b1a`.
- `git diff --stat 7963573a0b0692bc35a41243f447b84887d26b1a..c133fee8473fc3421d3999b9206e21593405563a -- apps/webapp/src/modules/payments apps/webapp/src/infra/payments apps/webapp/src/app-layer/booking apps/webapp/src/modules/booking-appointment-lifecycle apps/webapp/src/modules/patient-booking apps/webapp/src/infra/repos/pgPayments.ts apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts apps/webapp/db/schema apps/webapp/db/drizzle-migrations docs/_TODO/runs/s11-\*.md` → `61 files changed, 6117 insertions(+), 952 deletions(-)`; production diff и S11 evidence просмотрены.
- `node /home/dev/brain/tools/code-search.mjs "appointment payment cash refund YooKassa webhook settlement" --repo bcb -k 20`, `node /home/dev/brain/tools/code-search.mjs "payment immutable movement refund idempotency provider" --repo bcb -k 20`, `node /home/dev/brain/tools/code-search.mjs "PAY-REL-05 finance core" --repo bcb -k 20` → использованы до точечных `rg`.
- Первый `pnpm --dir apps/webapp exec vitest run ...` → не стартовал: `Command "vitest" not found`. `pnpm install --frozen-lockfile --offline` → packages restored из локального store; `pnpm -r --filter './packages/**' --if-present run build` → package builds PASS.
- Baseline exact candidate до новых acceptance-тестов: `pnpm --dir apps/webapp exec vitest run src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts src/modules/payments/providerWebhookSettlement.test.ts src/infra/payments/yookassaPaymentProvider.unit.test.ts src/modules/payments/service.test.ts src/infra/repos/pgPayments.providerWebhook.principal.unit.test.ts` → `51/51` PASS.
- Final тот же command после новых acceptance-тестов → `53 passed, 6 failed, 59 total`; шесть красных утверждений соответствуют F1–F5 (F2 имеет два provider status).
- `pnpm --dir apps/webapp exec vitest run src/infra/payments/paymentProviderIdentity.unit.test.ts src/app/api/payments/patientAcquiring.route.test.ts` → `29/29` PASS.
- `pnpm --dir apps/webapp exec vitest run 'src/app/api/doctor/booking-engine/appointments/[id]/payment/route.route.test.ts'` → `11/11` PASS; error log `provider_down` является ожидаемым сценарием теста.
- `pnpm --dir apps/webapp exec vitest run src/infra/payments/yookassaPaymentProvider.unit.test.ts -t 'yookassa webhook authenticity'` → `2/2` PASS на исходном candidate; FI-2/FI-3 затем оба дали red.
- Девять FI-команд запускались точечно через `pnpm --dir apps/webapp exec vitest run <file> -t '<test name>'`; каждый дал ровно ожидаемый red, таблица FI выше содержит фактические значения.
- `pnpm --dir apps/webapp exec eslint src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts src/infra/payments/yookassaPaymentProvider.unit.test.ts` → PASS.
- `pnpm --dir apps/webapp run typecheck` → PASS (`exit 0`).
- `git diff --exit-code c133fee8473fc3421d3999b9206e21593405563a -- apps/webapp/src/app-layer/booking/staffAppointmentPayments.ts apps/webapp/src/modules/payments/service.ts apps/webapp/src/infra/payments/yookassaPaymentProvider.ts apps/webapp/src/infra/repos/pgPayments.ts apps/webapp/db/drizzle-migrations` → PASS, временных production fault injection нет.
- Full CI и deploy не запускались по brief.

## Итоговый счёт

- Fault injection: **9 убито / 0 непоймано**.
- Исходный candidate: **5 независимых behavioral defects**, закреплённых **6 падающими assertions**, плюс **1 cross-scope inspection finding**.
- Новые тесты: только публичное денежное поведение/внешний provider side effect с независимым oracle; UI/DOM/copy/layout тестов нет.
