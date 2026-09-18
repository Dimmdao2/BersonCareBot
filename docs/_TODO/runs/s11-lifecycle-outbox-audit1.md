# S11 payment lifecycle/outbox — первичный аудит candidate `843983ff5`

## Предмет и классификация

- Base: `97c8a7f3e008a99f05d190aa9d759ca6b146ab07`.
- Candidate: `843983ff5c125502c953958b37e6b18c16cd8a5c`.
- Взглядом: атомарная граница provider event → canonical settlement → durable lifecycle work;
  переиспользование действующей очереди и `patientNotifications`; отсутствие второго notification store;
  архитектурные границы; полный inventory существующих patient-visible producers записи, визита и денег.
- Поведенческим тестом: только повторяемые дорогие молчаливые отказы из kill-set ниже, если их не держит уже
  существующий тест с независимым oracle на самом дешёвом публичном слое.
- Не тестировать: UI/DOM/copy, текст исходников или SQL, внутреннюю форму DTO и громкие compile/runtime failures.

## Blind kill-set

Составлен по S11 и `OWNER_PRODUCT_RULES.md` §21/§24.1 до чтения существующих тестов.

| ID  | Целевая поломка                                                                               | Проверка и результат                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Webhook отвечает `200`, но процесс падает до постановки lifecycle work                        | Новый acceptance-test красный: повтор после post-commit отказа не доигрывает lifecycle (`1` вызов вместо `2`)                                     |
| K2  | Повтор provider webhook или consumer повторно применяет доменный факт                         | Зелёные существующие тесты + fault injection: ослабление `outcome === captured` покрасило duplicate-test; сброс успешных step-ключей — retry-test |
| K3  | Отключённый/недоступный внешний канал делает ранний выход из lifecycle                        | Новый acceptance-test красный на staff cancel: получено `skipped`; отдельный зелёный inbox-test покраснел при переносе suppression выше append    |
| K4  | Временный отказ одного consumer-step терминализирует или теряет job                           | Новый calendar acceptance-test красный; существующий web-push retry-test покраснел при запрете `release` упавшего step                            |
| K5  | Сбой одного step сбрасывает уже успешный другой step                                          | Зелёный step-isolation test покраснел при fault injection освобождения успешных step-ключей                                                       |
| K6  | Исчерпание retry удаляет/прячет job без диагностики                                           | Взглядом FAIL: lifecycle job/attempt row отсутствует; после трёх HTTP-попыток остаётся только `console.error`                                     |
| K7  | Browser/widget/app либо иной существующий producer обходит общий lifecycle→Notifications вход | Взглядом FAIL: reminder, refund/retention и visit-status producers не входят в Notifications                                                      |
| K8  | Повторная доставка одного доменного факта использует нестабильный dedupe key                  | Взглядом PARTIAL: стабильный `integrator_message_id` и UNIQUE существующего store есть; часть producers до store не доходит                       |
| K9  | Отсутствие push-подписки/разрешения удаляет persistent inbox-факт                             | Новый тест зелёный и fault injection красный: append выполняется до `suppressExternalPush`; общий producer path всё ещё ломается по K3            |
| K10 | Consumer ждёт только периодический tick после commit                                          | Взглядом FAIL: resident worker lifecycle job отсутствует; используется request-local `Next after()`                                               |

Поведенческая часть kill-set: **6 классов проверено, 0 непойманных** (`K1`–`K5`, `K9`). Четыре структурных
пункта дешевле и честнее проверены взглядом (`K6`–`K8`, `K10`); для UNIQUE-стены `K8` отдельный тест не создан
по §10a.

Все fault injection были временными и откатаны. В production-коде после аудита нет незакоммиченных изменений.

## Вердикт

**FAIL. Candidate не реализует S11 и дополнительно не проходит webapp typecheck.**

## MUST FIX findings

### F1 — PAY-REL-01/02: деньги коммитятся без атомарного durable lifecycle job

Достижимый сценарий: `app.settle_booking_payment_webhook_event(...)` фиксирует provider event, платёж,
канонические статусы и `processed_at`; затем `processProviderWebhook` вызывает
`onAppointmentPaymentConfirmed` уже после возврата из SQL-корня. Candidate убрал `waitForDelivery`, поэтому
`createBookingSyncPort` отдаёт работу в request-local `Next after()` и после трёх HTTP-попыток только пишет
`console.error`. Падение процесса между денежным коммитом и этим callback оставляет деньги проведёнными без
проекции пациента, календаря, напоминаний и Notifications. Повтор webhook получает `already_processed` и
callback больше не вызывает.

Impact: пациент оплатил, а запись и все downstream effects могут навсегда остаться в старом состоянии.

Evidence: `modules/payments/service.ts:802-838`, `modules/integrator/bookingM2mApi.ts:114-162`,
`20260905T194500_the_booking_payment_webhook_settles_under_its_own_tenant.sql:106-132,208-285`; красный
acceptance-test `providerWebhookSettlement.test.ts`.

### F2 — PAT-NOTIF-01/02: transient inbox write подтверждается как успех

Достижимый сценарий: `appendPatientInboundAdminMessage` получает временный отказ БД. Candidate ловит ошибку в
`patientWebPushNotify.ts:200-217`, после чего при suppressed/disabled push возвращает `200`. M2M route кэширует
этот успешный ответ по idempotency key, а integrator оставляет step-key занятым. Повтор не состоится.

Impact: доменный факт навсегда отсутствует в «Уведомлениях», хотя остальная обработка выглядит успешной.

Evidence: красный acceptance-test `patientWebPushNotify.unit.test.ts` — promise разрешился
`{ ok: true, skipped: 'web_push_suppressed' }` вместо retryable rejection.

### F3 — PAT-NOTIF-02: suppression staff cancel/no-show гасит весь lifecycle

Достижимый сценарий: врач снимает «уведомлять пациента» при отмене или no-show. В
`emitStaffCanonicalBookingEvent` строка 64 возвращает `skipped` до `emitBookingEvent`; событие не доходит не
только до внешнего сообщения, но и до persistent inbox, отмены напоминаний и календаря.

Impact: отменённая запись может остаться в календаре, пациент может получить просроченное напоминание, а факт
отмены/no-show отсутствует в Notifications.

Evidence: `staffAppointmentLifecycleEffects.ts:16-106`, `staffBookingIntegratorEvent.ts:47-65`; красный
acceptance-test `staffBookingIntegratorEvent.d14.test.ts` (`skipped` вместо `sent`).

### F4 — PAY-REL-02: calendar failure ошибочно считается успешным step

Достижимый сценарий: Google Calendar временно недоступен. `trySyncCanonicalBookingToGoogleCalendar` ловит ошибку
и возвращает success, поэтому `runBookingLifecycleSteps` не освобождает idempotency key и больше не повторяет
calendar-step.

Impact: календарь навсегда расходится с канонической записью без retry.

Evidence: `bookingLifecycleRoute.ts:601-675`; красный acceptance-test
`bookingLifecycleRoute.stepIsolation.test.ts` — handler разрешился вместо retryable `google_calendar` failure.

### F5 — PAT-NOTIF-01: inventory покрыт не полностью

Candidate добавляет inbox-step только к `booking.created` и `booking.payment_captured`; существующие
`rescheduled/cancelled` доходят до него только по условным старым путям. Реальные семейства ниже остаются вне
единого feed:

| Семейство                  | Существующий producer                                                                      | Результат candidate                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Создание / ожидание оплаты | `patient-booking/canonicalCreate.ts`; staff manual routes                                  | Feed-step добавлен, но событие best-effort/deferred и теряется по F1 |
| Перенос                    | `patient-booking/service.ts`; `applyStaffRescheduleSideEffects`                            | Старый lifecycle path, не durable                                    |
| Отмена / no-show           | `patient-booking/service.ts`; `applyStaffCancelSideEffects`; `applyStaffNoShowSideEffects` | Staff suppression полностью обходит lifecycle по F3                  |
| Напоминание                | `appointmentReminderMaterialization.ts` → `outgoing_delivery_queue`                        | Только внешние доставки; inbox-записи нет                            |
| Получение оплаты           | payment webhook → `appointmentPaymentConfirmedHandler.ts`                                  | Feed-step добавлен, но не атомарен с settlement по F1                |
| Возврат / удержание        | `payments/service.ts` пишет `refund_succeeded` / `prepayment_retained`                     | Только payment history; lifecycle/Notifications producer нет         |
| Состоявшийся визит         | booking-engine status `visit_confirmed`/`completed`, видимый в patient history             | Lifecycle/Notifications producer нет                                 |

Impact: экран «Уведомления» остаётся выборочной лентой и зависит от источника/типа события, вопреки
`PAT-NOTIF-01`.

### F6 — candidate не компилируется

`patientWebPushNotify.ts` передаёт новый `payment_captured` в
`bookingLifecycleChatIntegratorMessageId`, но сигнатура helper осталась
`created | cancelled | rescheduled`.

Impact: webapp typecheck/build блокирован.

Evidence: `pnpm --dir apps/webapp typecheck` → `TS2345` на
`src/modules/patient-notifications/patientWebPushNotify.ts:204`.

## S11 IDs

| ID           | Статус           | Доказательство                                                                                                                          |
| ------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| PAY-REL-01   | FAIL             | Settlement root не пишет durable lifecycle work; F1                                                                                     |
| PAY-REL-02   | FAIL             | Resident lifecycle consumer отсутствует; calendar failure не retryable; F1/F4                                                           |
| PAT-NOTIF-01 | FAIL             | Producer inventory неполный; F2/F5                                                                                                      |
| PAT-NOTIF-02 | FAIL             | Локальный append-before-push работает, но staff suppression гасит весь event; F3                                                        |
| PAT-NOTIF-03 | FAIL             | Второй store не создан и стабильный UNIQUE переиспользован, но не все факты доходят до store, а append failure подтверждается           |
| PAY-REL-03   | PASS (процедура) | Blind kill-set составлен до тестов; 5 acceptance-тестов добавлены, 4 фиксируют candidate красным, 1 зелёный подтверждён fault injection |

## Архитектурная проверка взглядом

- Candidate diff: **4 production-файла, 28 вставок, 15 удалений** — результат команды
  `git diff --stat 97c8a7f3e..843983ff5`.
- Новых таблиц, миграций, notification store, raw SQL или infra-import из module не добавлено.
- Существующий Notifications store (`support_conversation_messages` через `patientNotifications`) и его UNIQUE
  `integrator_message_id` переиспользованы; второй inbox не создан.
- Существующая `outgoing_delivery_queue` и её resident worker для lifecycle job не переиспользованы вообще.
  Inbox-write встроен внутрь шага с именем `patient_web_push`, поэтому общий passage остаётся связан с внешним
  каналом и не является атомарным продолжением provider settlement.
- Миграционный/privilege preflight неприменим: команда
  `git diff --name-status 97c8a7f3e..843983ff5` показывает только четыре `M` в TypeScript production-файлах.

## Команды и результаты

| Команда                                                                                                                                                                                                                                                             | Результат                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `git diff --find-renames --find-copies --minimal 97c8a7f3e..843983ff5 -- <4 candidate paths>`                                                                                                                                                                       | Весь candidate diff прочитан                                                           |
| `node /home/dev/brain/tools/code-search.mjs "payment webhook canonical settlement lifecycle outbox patientNotifications" --repo bcb -k 20`                                                                                                                          | Найдены settlement root, handler и Notifications surface                               |
| `node /home/dev/brain/tools/code-search.mjs "booking visit payment reminder refund cancellation no-show patient notification producer" --repo bcb -k 30`                                                                                                            | Составлен producer inventory; затем подтверждён точечным `rg` по известным event types |
| `node /home/dev/brain/tools/code-search.mjs "durable lifecycle job consumer retry backoff idempotent step incident" --repo bcb -k 30`                                                                                                                               | Найдены HTTP lifecycle route, per-step idempotency и существующая delivery queue       |
| `pnpm --dir apps/webapp exec vitest --run src/modules/payments/providerWebhookSettlement.test.ts src/modules/patient-notifications/patientWebPushNotify.unit.test.ts src/app-layer/booking/staffBookingIntegratorEvent.d14.test.ts`                                 | **FAIL ожидаемо: 3 failed, 17 passed**                                                 |
| `pnpm --dir apps/integrator exec vitest --run src/integrations/bersoncare/bookingLifecycleRoute.stepIsolation.test.ts src/integrations/bersoncare/bookingLifecycleRoute.dedup.test.ts src/integrations/bersoncare/bookingLifecycleRoute.patientSuppression.test.ts` | **FAIL ожидаемо: 1 failed, 12 passed**                                                 |
| `pnpm --dir apps/webapp typecheck`                                                                                                                                                                                                                                  | **FAIL: один production `TS2345` candidate**                                           |
| `pnpm --dir apps/integrator typecheck`                                                                                                                                                                                                                              | PASS                                                                                   |
| `pnpm exec eslint <4 changed test paths>`                                                                                                                                                                                                                           | PASS, 0 errors; 3 webapp test files ignored by configured root pattern                 |

До валидных typecheck-команд выполнены `pnpm install --frozen-lockfile --offline` и сборка пяти workspace-пакетов;
оба шага завершились exit `0`. Первый typecheck до этого не считается сигналом: он падал на отсутствующих
dependencies/build artifacts. Full CI, live server, DB migration/preflight, deploy и push не запускались.

## Fault injection

| Временная production-поломка                                                   | Покрасневшее утверждение                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Пропустить inbox append при `suppressExternalPush`                             | `appendWebappMessage` получил `0` вызовов вместо `1`       |
| Не освобождать idempotency key упавшего web-push step                          | Два retry-теста получили `1` вызов notify вместо `2`       |
| Освобождать idempotency key успешного step                                     | Повтор прислал пациенту/врачу `['123', '777']` вместо `[]` |
| Разрешить post-settlement callback для любого `paymentId`, игнорируя `outcome` | Duplicate-test получил повторный callback вместо `0`       |
