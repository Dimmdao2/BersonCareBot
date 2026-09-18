# S11 atomic booking lifecycle producers — независимый аудит

**Candidate:** `567ca1cdaf8a1c711968f5ee4a53e44483146983`
**Зафиксированная база candidate:** `cf945c4ef126dcd9b6247d272758f3c15b27d940`
**Scope:** только booking lifecycle producers и общий durable passage; money/reminders/reconciliation не аудируются.
**Статус:** завершён 19.09.2026.

## Blind kill-set — составлен до чтения тестов и прежних audit evidence

Oracle для всех поведенческих пунктов — owner requirements S11 (`PAT-NOTIF-01..03`, `PAY-REL-01..03`),
`OWNER_PRODUCT_RULES.md` §21/§24.1 и worker brief. Отказы дорогие и молчаливые: пациент теряет факт либо получает
дубль, арендатор пересекает стену, а committed booking остаётся без повторяемой доставки. Самый дешёвый публичный
слой выбирается отдельно по пункту; UI/DOM/copy не проверяются.

| ID | Требование / целевая поломка | Тест или взгляд | Конечное наблюдаемое утверждение |
| --- | --- | --- | --- |
| K1 | Patient browser создаёт confirmed appointment, но canonical transition не ставит durable row в той же транзакции | TEST через публичный booking/service boundary + ВЗГЛЯД wiring | После commit существует ровно одна reclaimable lifecycle-row, связанная с committed transition; при rollback нет ни transition, ни row |
| K2 | Widget обходит общий patient root | TEST того же публичного booking boundary с widget source + ВЗГЛЯД wiring | Widget даёт тот же canonical transition/outbox outcome, без отдельной dispatch-дороги |
| K3 | App обходит общий patient root | TEST того же публичного booking boundary с app source + ВЗГЛЯД wiring | App даёт тот же canonical transition/outbox outcome, без отдельной dispatch-дороги |
| K4 | Awaiting-payment creation коммитится без lifecycle-row или ошибочно становится новым booking mode | TEST + ВЗГЛЯД canonical status/history | Existing awaiting-payment fact создаёт durable row атомарно и сохраняет существующую статусную семантику |
| K5 | Staff manual booking записывает appointment/history, но не outbox | TEST через staff booking boundary + ВЗГЛЯД wiring | Staff-created canonical transition и row коммитятся/откатываются вместе |
| K6 | Manual patient visit идёт отдельным путём | TEST через staff/manual-visit boundary + ВЗГЛЯД wiring | Факт manual patient visit проходит тот же atomic root и даёт одну durable row |
| K7 | Patient reschedule меняет canonical appointment, но событие остаётся best-effort post-commit | TEST + ВЗГЛЯД wiring | Новый immutable transition и ровно одна row коммитятся атомарно |
| K8 | Staff reschedule обходит общий root | TEST + ВЗГЛЯД wiring | Staff reschedule создаёт отдельный immutable transition и durable row |
| K9 | Patient cancel теряется после commit | TEST + ВЗГЛЯД wiring | Cancel transition переживает request/process loss как pending/retryable row |
| K10 | Staff cancel/manual cancel обходит общий root | TEST + ВЗГЛЯД wiring | Каждый разрешённый staff cancel даёт один canonical transition и одну row |
| K11 | Существующий no-show transition не ставится в очередь либо изменена его продуктовая семантика | TEST существующего публичного transition boundary + ВЗГЛЯД | No-show остаётся существующим фактом и проходит тот же outbox без нового статуса |
| K12 | Исключение между canonical write и enqueue оставляет одну сторону commit | TEST атомарности на именованной DEV с обязательным rollback | Невозможно наблюдать committed transition без row или row без transition |
| K13 | Process/request crash сразу после commit теряет событие | TEST durable passage/worker boundary | Committed pending row остаётся доступна resident worker без участия исходного request |
| K14 | Повтор одного immutable transition создаёт второй inbox/outbox факт | TEST replay/idempotency boundary | Повтор даёт одну queue identity и одну persistent Notifications entry |
| K15 | Два честных перехода одной appointment схлопываются по appointment id | TEST replay двух transition ids | Оба transition независимо доставляются и дают две соответствующие записи, без взаимного dedupe |
| K16 | Multi-slot creation/payment-chain схлопывает разные appointments либо дублирует один transition | TEST публичного multi-slot результата + ВЗГЛЯД key | Каждый фактический slot transition имеет собственную immutable identity; повтор каждого не дублируется |
| K17 | Transient signed M2M/webapp consumer failure помечает row done/dead либо теряет lease | TEST worker failure boundary | Row остаётся retryable с backoff/reclaimable состоянием и затем может завершиться |
| K18 | Исчерпание попыток оставляет только dead row без операторского сигнала | TEST worker terminal failure boundary | Terminal row диагностируема и создаёт ровно один operator incident |
| K19 | Подмена tenant/payment/appointment/patient проходит signed lifecycle endpoint | TEST HTTP/consumer public boundary | Любое несовпадение binding fail-closed: persistent append/внешняя доставка не происходят, row не ложно завершается |
| K20 | Выключенные внешние каналы/конкретное сообщение гасят persistent patient Notifications append | TEST lifecycle endpoint с подавленными channel settings | Persistent entry создаётся независимо; suppression относится только к Telegram/MAX/email/web-push |
| K21 | Нет push/внешнего sender, и это ошибочно удаляет факт из ленты | TEST lifecycle endpoint | Успешный persistent append наблюдаем даже при нуле доступных внешних каналов |
| K22 | Старый `after()`/best-effort/direct-dispatch путь остаётся достижим и даёт вторую доставку | ВЗГЛЯД exact call-sites + TEST конечного dedupe/delivery | Для scoped facts существует один durable passage, одно consumer-выполнение и одна persistent entry |
| K23 | Resident worker не забирает новый kind либо signed endpoint не входит в общий lifecycle handler | ВЗГЛЯД composition/registry + TEST end-to-end service boundary | Pending row проходит queue claim → signed webapp endpoint → existing lifecycle/Notifications path |
| K24 | Migration выдаёт/отзывает права, создаёт объект не тем owner или не объявляет runtime privileges | ВЗГЛЯД migration/declaration/generated diff + штатные order/privilege gates + owner-aware rollback-only DEV preflight | Preflight/gates принимают candidate; письменный privilege разбор покрывает каждое тело и runtime role |
| K25 | Stable key зависит только от mutable appointment id/display payload | ВЗГЛЯД schema/function/key construction + TEST K14/K15 | Key основан на immutable transition/history id и стабилен при replay |
| K26 | Добавлены самовольные `completed`/`visit_confirmed` producers | ВЗГЛЯД diff и exact registry/call-site search | Новых producer/event transitions этого типа нет |
| K27 | Generated privilege artifacts расходятся с единственной declaration | ВЗГЛЯД diff + generation/static gate | Рабочее дерево после генератора не меняется, declaration и артефакты согласованы |

Непойманный named fault после проверки будет либо закреплён допустимым acceptance-test с независимым oracle,
либо оформлен точным finding, если это разовое/структурное нарушение. Процент покрытия kill-set не используется.

## Verdict

`FAIL`

Candidate действительно добавляет атомарные trigger-producers и подключает их к resident worker, но конечный
путь не выполняет обязательные свойства S11. Красные acceptance-тесты оставлены как handoff; product code не
изменялся.

## Findings

### F1 — MUST FIX: committed creation может навсегда остаться без lifecycle delivery; reschedule может доставить старое время

**Достижимый сценарий.** Patient creation сначала коммитит canonical appointment и trigger-row, а затем отдельными
операциями связывает projection: `canonicalCreate.ts:467-472`, затем `:520-534` для `awaiting_payment` или
`:583-600` для confirmed. Staff manual booking делает то же после `createAppointment`: `manual/route.ts:244-262`;
scheduled manual patient visit — `manual-patient-visit/route.ts:207-225`. Если процесс падает сразу после canonical
commit, durable row остаётся, но signed consumer требует `getBookingByCanonicalAppointment` и отвечает `503`
при отсутствии projection (`appointments/lifecycle/route.ts:50-59`). Никакой ветки восстановления projection в
consumer нет; после восьми попыток row становится dead. Это затрагивает patient browser/widget/app, staff manual
booking и scheduled manual patient visit.

Patient/staff reschedule коммитит history-row в canonical transaction, но projection обновляется после него
(`patient-booking/service.ts:511-516`). Worker может прочесть прежние `booking.slotStart/slotEnd` и отправить
устаревший перенос, потому что consumer строит payload из projection (`appointments/lifecycle/route.ts:83-89`),
а не из canonical appointment/history.

**Impact:** после уже успешной записи пациент может не получить факт вообще; при переносе может получить неверное
время. Это нарушает worker brief: после commit не должно оставаться синхронного шага, потеря которого лишает
событие delivery; crash-after-commit должен восстанавливаться одним durable passage.

**Oracle:** ВЗГЛЯД, K1–K13/K23. Отдельный тест не сохранялся: дефект — отсутствие recovery write и межтранзакционное
окно; дешёвый unit-test продублировал бы порядок строк, а полная process-crash проверка требует применённой
migration, запрещённой этому аудиту.

### F2 — MUST FIX: awaiting-payment превращается в подтверждённую запись в Notifications

Migration правильно сохраняет `fact='awaiting_payment'` (`20260918T203840_booking_lifecycle_outbox_producers.sql:19-33`),
но consumer сводит его к `eventType='booking.created'` и `patientPushVariant='created'`
(`appointments/lifecycle/route.ts:65-70,100-105`). Persistent append затем строит existing confirmed copy
для variant `created` (`patientWebPushNotify.ts:186-207`, `pushNotificationCopy.ts:219-223`). Старый корректный
awaiting-payment effect с checkout/deadline выключен production DI (`buildAppDeps.ts:1519-1528`).

**Impact:** человек с неоплаченной бронью видит в постоянной ленте «Вы записаны», а не существующий факт ожидания
оплаты; ссылка и срок оплаты теряются. Нарушены PAT-NOTIF-01 и явное требование brief о корректном existing
payment-waiting fact.

**Acceptance:** `route.route.test.ts` — candidate отвечает `200`, но передаёт `booking.created` вместо
`booking.awaiting_payment`.

### F3 — MUST FIX: signed consumer не проверяет history→appointment/fact и patient projection→appointment bindings

Consumer проверяет только suffix idempotency key и `appointment.organizationId` (`route.ts:39-53`). Он не читает
`historyId` и не доказывает его `appointment_id`, `organization_id`, `event_type`; затем предпочитает
`booking.userId` каноническому `appointment.platformUserId` (`:54-59,83-85`) без сравнения.

**Достижимые сценарии:** signed replay с history одного перехода и appointment другого создаёт ложный cancel/
reschedule; ошибочно связанная projection отправляет persistent notification другому пациенту. В обоих случаях
endpoint отвечает `200`. Это нарушает обязательный fail-closed tenant/payment/appointment/patient binding.

**Acceptance:** два теста `route.route.test.ts` ожидают `409` и отсутствие dispatch, candidate возвращает `200`
в обоих случаях. Tenant binding по appointment отдельно есть; payment binding regression предыдущего common
payment passage остаётся зелёным и не переписывался в этом bounded-аудите.

### F4 — MUST FIX: два честных reschedule одного appointment схлопываются в persistent Notifications

Outbox keys различны и корректны (`booking.lifecycle:rescheduled:<historyId>`), а integrator step-dedupe включает
event id (`bookingLifecycleRoute.ts:125-135`). Но persistent passage передаёт stable key только
`booking-rescheduled:<bookingId>` (`:849-852`), и webapp строит `integratorMessageId` только из variant и booking id
(`patientWebPushNotify.ts:197-207`, `appendPatientInboundAdminMessage.ts:63-68`). Второй честный history transition
по той же записи попадает под dedupe первого.

**Impact:** пациент видит только один из двух реальных переносов. Нарушены K15 и PAT-NOTIF-03.

**Acceptance:** `bookingLifecycleRoute.dedup.test.ts` наблюдает два вызова persistent boundary, но только один
уникальный stable key (`expected 2, received 1`).

### F5 — MUST FIX: suppression reschedule не ограничено внешними каналами корректно

Для created/cancelled внешний patient messenger step обёрнут проверкой `suppressPatientNotification`; для
rescheduled он добавляется безусловно (`bookingLifecycleRoute.ts:830-838`). Persistent push/inbox step при этом
правильно остаётся (`:849-852`).

**Impact:** при выключенном пациентском сообщении перенос всё равно уходит пациенту в Telegram/MAX; это
противоречит PAT-NOTIF-02 и owner rule §24.1: suppression должно гасить только выбранную внешнюю доставку, сохраняя
persistent fact и независимые технические эффекты.

**Acceptance:** `bookingLifecycleRoute.patientSuppression.test.ts` получил recipients `[123, 777]`; patient `123`
не должен был присутствовать, а persistent `notifyPatientWebPush` должен был остаться.

### F6 — MUST FIX: terminal booking lifecycle replay не создаёт operator incident

`finalizeClaimedRowFailure` зовёт только `recordCapturedBookingPaymentReplayDeadIncident`
(`outgoingDeliveryWorker.ts:192-202`), а helper сразу выходит, если payload не содержит `paymentCaptured`
(`:212-220`). Новый `payloadJson.bookingLifecycle` поэтому помечается dead без operator incident.

**Impact:** после восьми неудачных replay пользовательское событие теряется тихо. Нарушены PAY-REL-02, owner
rule §24.1 и K18.

**Acceptance:** `outgoingDeliveryWorker.bookingLifecycle.s11.test.ts` наблюдает dead row, но recorder вызван
`0` раз вместо `1`.

## Producer inventory и atomic root

| Источник | Canonical atomic root и stable row | Старый обход | Итог |
| --- | --- | --- | --- |
| Patient browser / widget / app, confirmed и awaiting-payment | Все каналы сходятся в `canonicalCreate.ts:427-472`; `AFTER INSERT be_appointments` ставит `booking.lifecycle:<created|awaiting_payment>:<appointmentId>` в той же transaction (`migration:10-38,81-85`) | `bookingCreatedEffects` отключён, `createBookingSyncPort` no-op для обычного created (`bookingM2mApi.ts:144-157`) | Atomic enqueue PASS; end-to-end FAIL по F1/F2 |
| Staff manual booking | `bookingEngine.createAppointment` transaction + тот же appointment trigger | Compatibility `emitBookingEvent` остаётся в route, но production port его гасит (`manual/route.ts:263-280`) | Atomic enqueue PASS; delivery FAIL по F1 |
| Manual patient visit | Scheduled kind создаёт canonical appointment в одной transaction и попадает под trigger; walk-in создаёт только clinical visit и не является booking transition | Legacy created call подавлен production port; walk-in завершается до него (`manual-patient-visit/route.ts:195-245`) | Scheduled enqueue PASS; delivery FAIL по F1. Самовольный completed/visit_confirmed не добавлен |
| Patient reschedule | `app.apply_current_patient_booking_reschedule(text)` обновляет appointment и вставляет history в одной function; history trigger ставит `booking.lifecycle:rescheduled:<historyId>` | Post-commit `booking.rescheduled` call production port гасит | Atomic enqueue PASS; final payload/dedupe FAIL по F1/F4/F5 |
| Staff reschedule | `pgBookingAppointmentLifecycle.ts:463-522` — appointment + immutable history в одной Drizzle transaction; тот же history trigger | Production port гасит старый direct handoff | Atomic enqueue PASS; final payload/dedupe FAIL по F1/F4/F5 |
| Patient/staff cancel | Patient SQL root и staff `pgBookingAppointmentLifecycle.ts:604-646` пишут immutable `cancelled` history; trigger key `booking.lifecycle:cancelled:<historyId>` | Production port гасит прежние best-effort calls | Atomic enqueue PASS; binding/terminal incident FAIL по F3/F6 |
| Existing no-show | `pgBookingAppointmentLifecycle.ts:753-785` пишет существующий `no_show` history в transaction; trigger key `booking.lifecycle:no_show:<historyId>` | Нового product status/path нет | Atomic enqueue PASS; consumer переводит факт в generic cancelled, затем общие F3/F6 |

Multi-slot creation вызывает один canonical INSERT на каждый appointment (`canonicalCreate.ts:432-472`), а trigger
формирует key из appointment id. Поэтому разные slots не схлопываются, replay того же INSERT не создаёт вторую row
из-за `ON CONFLICT(event_id) DO NOTHING`. Это корректно для booking creation; payment aggregation S8 не входила в
этот аудит.

## Общий durable passage

- `outgoing_delivery_queue(kind='booking_lifecycle', channel='internal')` создаётся trigger-ом в business
  transaction; commit/rollback appointment/history и row атомарны по PostgreSQL semantics.
- Resident worker распознаёт `payloadJson.bookingLifecycle`, вызывает signed webapp lifecycle endpoint и только
  после `ok` делает `queueMarkSent` (`outgoingDeliveryWorker.ts:702-725`). `dispatching` в этой ветке нет.
- Transient `503` проходит через общий `finalizeClaimedRowFailure` и остаётся `failed_retryable` с backoff. Это
  закреплено зелёным acceptance-test.
- Persistent Notifications append выполняется до channel selection и до `suppressExternalPush`
  (`patientWebPushNotify.ts:186-207,211-249`), поэтому сам store не зависит от external settings. Неверны семантика
  awaiting-payment (F2), transition dedupe (F4) и reschedule messenger suppression (F5).
- Все найденные scoped post-commit call-sites входят через `createBookingSyncPort`; production ветки created,
  cancelled и rescheduled возвращают без `after()`/HTTP (`bookingM2mApi.ts:129-157`). Patient direct created effect
  отключён DI. Двойного scoped producer рядом с trigger не найдено.

## Migration / owners / privileges

1. Candidate создаёт две `SECURITY DEFINER` trigger functions владельца
   `app_seam_payment_webhook_owner` и два trigger statement владельца `app_object_owner`. Новых relations/indexes
   нет. Function bodies требуют только `INSERT` девяти названных колонок `public.outgoing_delivery_queue`; это
   ровно объявлено в `declaration.ts:26959-26973`.
2. `app_object_owner` получает `EXECUTE` на обе функции из generated artifacts, чтобы установить triggers;
   functions не выдаются runtime callers/PUBLIC. Generated dev/test/prod artifacts согласованы с declaration.
3. Точный поиск
   `rg -n -i '(^|[[:space:]])(grant|revoke)([[:space:]]|$)' apps/webapp/db/drizzle-migrations/20260918T203840_booking_lifecycle_outbox_producers.sql`
   завершился code `1` с пустым stdout: `GRANT/REVOKE` в migration нет.
4. Owner-aware preflight применил все три pending migrations под declared statement owners и сделал `ROLLBACK`;
   итог `pending=3 total=235 reapplied=0 unapplied=0`, PASS. Именованная DEV не изменилась.
5. Точный поиск
   `git diff cf945c4ef126dcd9b6247d272758f3c15b27d940..567ca1cdaf8a1c711968f5ee4a53e44483146983 -- '*.ts' '*.sql' | rg -n 'completed|visit_confirmed'`
   завершился code `1` с пустым stdout: producers `completed`/`visit_confirmed` не добавлены.

## Kill-set outcome

| Kill-set | Итог | Evidence |
| --- | --- | --- |
| K1–K6 creation sources | FAIL | Trigger enqueue атомарен, но post-commit projection dependency теряет delivery при crash (F1); awaiting semantics неверна (F2) |
| K7–K11 transitions/no-show | FAIL | History enqueue атомарен; reschedule читает race-prone projection, distinct transitions collapse, suppression неверно (F1/F4/F5) |
| K12 atomic business write + enqueue | PASS (ВЗГЛЯД + preflight) | `AFTER INSERT` triggers и queue insert живут в той же PostgreSQL transaction; rollback-only owner preflight PASS |
| K13 crash after commit | FAIL | Worker row durable, но projection отсутствует/может быть stale; endpoint не реконструирует её (F1) |
| K14 replay того же immutable transition | PASS | Queue `ON CONFLICT(event_id) DO NOTHING`; step dedupe включает immutable event id |
| K15 два честных transition | FAIL | Outbox различает history ids, persistent store key — нет (F4) |
| K16 multi-slot | PASS для booking scope | Per-appointment INSERT/key; разные slots не схлопываются. Payment aggregation вне bounded scope |
| K17 transient failure | PASS | Acceptance: retryable row, no sent/dead/dispatching |
| K18 terminal failure | FAIL | Dead row без incident (F6) |
| K19 bindings | FAIL | Tenant appointment binding есть; history/fact и patient bindings отсутствуют (F3). Existing payment regression green |
| K20–K21 persistent append vs settings | PASS для store, FAIL suppression | Append до channel gate; reschedule messenger всё равно отправляется (F5) |
| K22 old bypasses | PASS | Scoped production calls no-op; `bookingCreatedEffects` disabled; двойного dispatch не найдено |
| K23 common worker/endpoint | FAIL | Wiring есть, но consumer не самодостаточен после commit (F1) |
| K24/K27 migration/privileges | PASS | Static gates, generated artifacts и owner-aware rollback-only preflight green |
| K25 stable key | PASS в queue, FAIL в inbox | Queue uses immutable appointment/history id; inbox discards transition id (F4) |
| K26 forbidden producers | PASS | Exact candidate diff search пуст |

## Acceptance tests и fault injection

Сохранены только поведенческие tests через HTTP/service/worker boundaries; UI/DOM/copy/source-text tests нет.

| Test | Независимый oracle / fault injection | Наблюдение на candidate |
| --- | --- | --- |
| Lifecycle route: history binding | Подставлен неподтверждённый history id; ожидается fail-closed без dispatch | RED: `200` вместо `409` |
| Lifecycle route: patient binding | Projection user заменён на другого; ожидается fail-closed | RED: `200` вместо `409` |
| Lifecycle route: awaiting-payment | Подан canonical awaiting fact; expected downstream fact не должен стать created/confirmed | RED: `booking.created` вместо `booking.awaiting_payment` |
| Integrator: two honest reschedules | Два разных immutable transition ids одного booking | RED: два вызова имеют один stable key |
| Integrator: reschedule suppression | `suppressPatientNotification=true`, persistent port доступен | RED: внешний patient recipient `123` всё равно вызван; persistent step сохранён |
| Worker: transient consumer failure | Явная временная product-инъекция `if (!result.ok)` → `if (result.ok)` | RED именно утверждение retry semantics: expected `{processed:0, errors:1}`, received `{processed:1, errors:0}`; product mutation откатана, test на candidate GREEN |
| Worker: terminal consumer failure | Candidate terminal branch — целевая поломка | RED: dead row есть, incident recorder `0` вместо `1` |

Красные candidate-тесты сами являются fault injections найденных дефектов по §24.5; временная product mutation
потребовалась только для исходно зелёного transient-retry test. После отката
`git diff -- apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts` пуст.

## Выполненные проверки

| Команда | Результат |
| --- | --- |
| `pnpm --dir apps/webapp exec vitest run src/app/api/integrator/appointments/lifecycle/route.route.test.ts src/modules/payments/providerWebhookSettlement.test.ts src/modules/patient-notifications/patientWebPushNotify.unit.test.ts src/app-layer/booking/staffBookingIntegratorEvent.d14.test.ts src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts src/modules/patient-booking/canonicalCreate.d14.test.ts src/modules/patient-booking/service.d14.test.ts src/app/api/doctor/booking-engine/appointments/manual/route.route.test.ts src/app/api/doctor/booking-engine/appointments/manual-patient-visit/route.route.test.ts src/app-layer/booking/bookingCreatedEffects.test.ts` | EXPECTED FAIL: 10 files, 73 tests; 70 pass, 3 new acceptance failures F2/F3 |
| `pnpm exec vitest run src/integrations/bersoncare/bookingLifecycleRoute.emptyAudience.test.ts src/integrations/bersoncare/bookingLifecycleRoute.d14.test.ts src/integrations/bersoncare/bookingLifecycleRoute.stepIsolation.test.ts src/integrations/bersoncare/bookingLifecycleRoute.patientSuppression.test.ts src/integrations/bersoncare/bookingLifecycleRoute.dedup.test.ts src/integrations/bersoncare/bookingLifecycleRoute.portContext.test.ts src/integrations/bersoncare/bookingLifecycleRoute.reminderPlan.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.finalize.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.bookingLifecycle.s11.test.ts` (cwd `apps/integrator`) | EXPECTED FAIL: 9 files, 59 tests; 56 pass, 3 new acceptance failures F4–F6 |
| `pnpm --dir apps/webapp exec vitest run src/modules/payments/service.test.ts` | PASS: 1 file, 19 tests |
| `pnpm --dir apps/webapp typecheck` | PASS |
| `pnpm --dir apps/integrator typecheck` | PASS |
| `pnpm --dir apps/webapp lint` | PASS, включая migration privilege/order gates и их self-tests |
| `pnpm --dir apps/integrator lint` | PASS, включая queue-port/legacy-producer gates |
| `bash apps/webapp/scripts/check-drizzle-migration-order.sh` | PASS |
| `pnpm run check:db-privileges-generated` | PASS: dev/test/prod privileges, allowlists и port-context artifacts byte-for-byte current |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm run test:db-privileges"` | PASS: 391 total; 188 pass, 203 skip, 0 fail |
| `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` | PASS: owner-aware named-DEV apply + rollback; `pending=3`, `unapplied=0` |

По запрету brief не запускались execute/full CI/live UI/deploy/push. Money/reminders/reconciliation findings не
добавлялись; payment regression использован только для доказательства сохранности общего ранее построенного passage.
