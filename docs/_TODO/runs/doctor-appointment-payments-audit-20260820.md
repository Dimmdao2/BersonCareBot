# Auditor-live: оплата в карточке записи

- Объект аудита: `cfbfa8d5e` (`wt/doctor-appointment-payments-20260820`)
- Authority: owner-review «Карточка записи»; `DOCTOR_UI_REWORK_2026-07-20/PLAN.md` UI-1/UI-1d; уточнение владельца 20.08.2026 из audit brief.
- Роль: первый независимый `auditor-live`; production fixes запрещены.

## Классификация test / view

1. `TEST + VIEW`: повторяемый расчёт `none/partial/paid`, фактические суммы и UI-представление трёх owner-состояний.
2. `TEST + VIEW`: повторяемые authorization/scope/idempotency правила cash mutation; взглядом — server wiring и entitlement boundary.
3. `TEST + VIEW`: повторяемое создание payment link, остаток, идемпотентность и provider failure; взглядом — reuse единственного provider/chokepoint.
4. `TEST + VIEW`: повторяемая идентичность URL; взглядом — QR composition без второго payment identity.
5. `TEST + VIEW`: повторяемая агрегация booking/cash/acquiring и денежные границы; взглядом — независимый источник цены записи.
6. `VIEW + точечный static check`: route/Drizzle port/repository/DI, ownership и единый payment/patient-payment проход.
7. `VIEW + существующий migration gate`: имя/forward-only/VERIFY/schema/indexes/отсутствие grants и ad hoc RLS; не тест текста SQL.
8. `VIEW + targeted UI behavior`: doctor primitives/composition/loading/error states; один UI-сценарий автоматизируется только если его нельзя дешевле доказать на публичной компонентной границе.
9. `VIEW`: plan/checklist/evidence sync; тест текста плана не создаётся.

## Blind kill-set

Список зафиксирован по authority до чтения production diff и существующих тестов.

- `K1 status-and-amount`: частичная оплата ошибочно объявляется полной либо `none/partial/paid`, `paid/total/remaining` расходятся с фактическими суммами.
- `K2 independent-price-boundaries`: `total` ошибочно выводится из платежей вместо цены записи; нулевая цена или переплата дают отрицательный остаток/неверный статус.
- `K3 appointment-aggregation`: booking prepayment, cash и acquiring одной записи не складываются ровно один раз либо в сумму попадает платёж другой записи/пациента/организации.
- `K4 cash-authorization-scope`: неавторизованный или лишённый entitlement doctor, чужая organization/patient/appointment relation достигает cash write.
- `K5 cash-idempotency`: повтор запроса/двойной клик с той же identity создаёт две cash rows или удваивает оплаченную сумму.
- `K6 link-remaining-and-scope`: provider получает не точный положительный остаток конкретной записи либо запрос может выставить счёт для чужой relation.
- `K7 link-idempotency-and-failure`: повтор создаёт второй intent/link; provider/config failure оставляет persisted/returned ложный success.
- `K8 qr-url-identity`: QR кодирует не точный server-returned payment URL или создаёт отдельную payment identity.

## Бинарный результат по scope

1 → `FAIL` → positive-price UI различает `none/partial/paid` и показывает суммы, но `getAppointmentPaymentSummary()` возвращает каждой записи полную сумму общего chain payment: acceptance `attributes only this appointment share...` ожидал `10000`, получил raw `20000`; карточка может назвать частичную запись полностью оплаченной.
2 → `FAIL` → organization/specialist rejection для cash/link даёт `404`, но оба entitlement-denial сценария вернули `200`; параллельный cash double-click вернул две разные payment identity. Route делает read-before-write (`route.ts:72-80`) без idempotency key/unique door.
3 → `FAIL` → route передаёт provider точный остаток и стабильный key, reuse существующего `modules/payments`/adapter и failure payload тестами подтверждены. Но route не вызывает `requireEntitlementForMutation`; реальный `createAppointmentPaymentIntent()` требует `assertWriteClearance('payments')` (`modules/payments/service.ts:391`, DI `buildAppDeps.ts:999`), поэтому штатный link path заканчивается `503 mechanic write clearance required` до provider. Это не готовое owner-действие.
4 → `FAIL` → QR изначально содержит ровно server-returned URL, отдельная payment identity не создаётся. После смены `appointmentId` прежние link и QR остаются в DOM: acceptance `keeps the QR...and clears that identity...` красный.
5 → `FAIL` → цена берётся независимо из `booking.priceMinorSnapshot`, remaining clamp не отрицательный, overpay отображается как paid. Но нулевая цена отображается `Не оплачено`, а общий booking prepayment целиком засчитывается каждой записи вместо `resolveAppointmentAmountMinor()`; оба дефекта воспроизведены acceptance-тестами.
6 → `FAIL` → DB-вызовы проходят через DI/Drizzle repositories и repo filters включают organization + appointment + patient. Но route сам содержит aggregation, remaining, cash-idempotency и provider orchestration (`route.ts:68-85`), дублируя существующие payments/patient-payments проходы; это не thin route и не один общий §5 chokepoint.
7 → `PASS` → timestamped forward-only migration добавляет nullable FK `appointment_id` и индекс, schema совпадает; migration-order, frozen-legacy и privilege gates зелёные. GRANT/REVOKE/RLS/POLICY в migration отсутствуют; ad hoc RLS не требуется.
8 → `PASS` → `AppointmentPaymentSection` использует zonal doctor `Button`, старый diagnostic panel не возвращён, pending блокирует действия, link появляется только после `response.ok && json.ok`, ошибки видимы через `role=alert`. Scoped ESLint: 0 errors (два уже видимых warning в production component: hook dependency и raw QR `<img>`).
9 → `FAIL` → UI-1d отмечен `[x]` только ссылками на код и `git diff --check`, при этом три исходных owner-box остаются `[ ]` (`PLAN.md:533-536`), acceptance красный, а webapp typecheck падает на target route и не обновлённых patient-payment fixtures/port. Готовность и validation в плане завышены.

## Fault injection mapping

- `K1`: временно `paid >= totalMinor` → `paid > 0`; partial case покраснел: не найден `Частично оплачено`, появился `Оплачено`.
- `K2`: current-product zero-price assertion красный; overpay/actual amount assertions зелёные.
- `K3`: current-product shared-payment assertion красный: expected `10000`, current summary `20000`.
- `K4`: current-product cash/link entitlement assertions красные; scope rejection assertions зелёные.
- `K5`: current-product concurrent double-click assertion красный: две разные cash identity.
- `K6`: временно исключён `manualMinor` из remaining; exact-balance assertion покраснел: expected `6500`, provider получил `7500`.
- `K7a`: временно сломан early return existing intent; existing-intent assertion покраснел на `fault_injected_duplicate_intent`.
- `K7b`: временно provider catch возвращал `200/ok:true/paymentLink`; failure assertion покраснел (`expected 503, received 200`).
- `K8`: current-product stale appointment identity assertion красный; предшествующие exact `href`/QR URL assertions зелёные.

Все четыре временные production-поломки откатаны; `git diff --exit-code` по трём затронутым production-файлам зелёный. Точное число: `8/8` blind classes пойманы, `8` убито, `0` непоймано. Внутри `K7` отдельно убиты оба независимых oracle: idempotency и provider failure.

## Exact commands / results

- `pnpm --dir apps/webapp exec vitest --run --project=route 'src/app/api/doctor/booking-engine/appointments/[id]/payment/route.route.test.ts'` → `FAIL`: 1 file; 7 tests, 3 failed / 4 passed. Красные: cash entitlement, link entitlement, concurrent cash identity.
- `pnpm --dir apps/webapp exec vitest --run --project=ui src/app/app/doctor/calendar/DoctorCalendarEventPanel.ui.test.tsx` → `FAIL`: 1 file; 8 tests, 2 failed / 6 passed. Красные: zero price, stale link/QR after appointment change.
- `pnpm --dir apps/webapp test:fast -- 'src/modules/payments/service.test.ts'` → `FAIL`: relevant file 12 tests, 1 failed / 11 passed. Красный: shared multi-appointment payment attribution.
- `pnpm --dir apps/webapp typecheck` → `FAIL` (exit 2): 5 diagnostics — unrelated symlinked integrator `luxon` resolution плюс 4 target-relevant errors: nullable `platformUserId` в new route, два `PatientPayment` fixtures без `appointmentId`, один `PatientPaymentsPort` fixture без `listAppointmentPayments`.
- `pnpm --dir apps/webapp exec eslint db/schema/patientPayments.ts 'src/app/api/doctor/booking-engine/appointments/[id]/payment/route.ts' 'src/app/api/doctor/booking-engine/appointments/[id]/payment/route.route.test.ts' src/app/app/doctor/calendar/AppointmentPaymentSection.tsx src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx src/app/app/doctor/calendar/DoctorCalendarEventPanel.ui.test.tsx src/infra/repos/inMemoryPatientPayments.ts src/infra/repos/pgPatientPayments.ts src/modules/patient-payments/ports.ts src/modules/patient-payments/service.ts src/modules/payments/service.test.ts` → exit 0, 0 errors / 2 production warnings.
- `pnpm --dir apps/webapp exec eslint 'src/app/api/doctor/booking-engine/appointments/[id]/payment/route.route.test.ts' src/app/app/doctor/calendar/DoctorCalendarEventPanel.ui.test.tsx src/modules/payments/service.test.ts` → exit 0, no output.
- `bash apps/webapp/scripts/check-drizzle-migration-order.sh` → `run-webapp-drizzle-migrate transaction-safe migration layout check: OK`; `check-drizzle-migration-order: OK`.
- `bash apps/webapp/scripts/check-legacy-migrations-frozen.sh` → exit 0, no output.
- `node scripts/check-migration-privileges.mjs` → `OK (60 migration files)`.
- `git diff --check` → exit 0, no output.
- `git diff --exit-code -- 'apps/webapp/src/app/api/doctor/booking-engine/appointments/[id]/payment/route.ts' apps/webapp/src/app/app/doctor/calendar/AppointmentPaymentSection.tsx apps/webapp/src/modules/payments/service.ts` → exit 0 после fault injection rollback.
- K1 injection: `pnpm --dir apps/webapp test:ui -- 'src/app/app/doctor/calendar/DoctorCalendarEventPanel.ui.test.tsx' -t 'renders the partial state'` → partial assertion added a third red test.
- K6 injection: `pnpm --dir apps/webapp test:route -- 'src/app/api/doctor/booking-engine/appointments/[id]/payment/route.route.test.ts' -t 'exact remaining appointment balance'` → exact remaining assertion red, `6500` vs `7500`.
- K7a injection: `pnpm --dir apps/webapp exec vitest --run --project=fast src/modules/payments/service.test.ts -t 'keeps an existing payment intent available'` → 1 selected failed / 11 skipped.
- K7b injection: `pnpm --dir apps/webapp exec vitest --run --project=route 'src/app/api/doctor/booking-engine/appointments/[id]/payment/route.route.test.ts' -t 'returns provider failure'` → 1 selected failed / 4 skipped.
- Full CI, dev-server, DEV/TEST DB и PROD не запускались/не затрагивались по brief.

## Что исправляет worker

1. Перенести appointment payment aggregate/orchestration из route в один application/service boundary и переиспользовать appointment share calculation из payments service.
2. Провести cash и link через `requireEntitlementForMutation(..., 'payments')` и registry-backed physical door; сохранить org/patient/appointment ownership.
3. Дать cash mutation атомарную idempotency identity (request key + unique/upsert/transaction), а не read-before-insert по сумме.
4. Обработать zero/overpay и shared booking/cash/acquiring ровно один раз от независимой цены записи.
5. При смене appointment немедленно очистить/изолировать summary/error/link/QR и защитить загрузку от stale response.
6. Исправить четыре target-relevant typecheck ошибки и синхронизировать plan только после зелёных acceptance/typecheck evidence.

## Итог

`FAIL` по `cfbfa8d5e`: owner payment outcome не готов к land. Acceptance-тесты намеренно оставлены красными для worker; product-код аудитором не исправлялся.
