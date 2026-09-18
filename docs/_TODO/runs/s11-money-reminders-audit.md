# S11 reminders / money lifecycle — independent audit

Authority: `APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md` S11/PAY-APPT-30,
`OWNER_PRODUCT_RULES.md` §24.1, `s11-money-reminders-audit-brief.md`.

## Blind classification and kill-set

Written before opening existing tests. Oracle is the owner's requirement in the audit brief, not the implementation.

| ID | Requirement / independent fault | Method chosen before inspection |
| --- | --- | --- |
| K1 | A configured reminder silently disappears when no external channel is enabled; or creates a feed fact before due / per transport. | Behavioral test at materialization / worker / public notify boundary. |
| K2 | Replacing or cancelling a generation leaves an old reminder deliverable, including a leased replay. | Behavioral test for generation/replay; inspect transaction root. |
| K3 | Cash prepayment / partial / full settlement commits its ledger but loses the lifecycle job. | Inspect cash transaction and immutable-ledger trigger, owner-aware DEV rollback preflight; do not fake SQL atomicity. |
| K4 | A refund request/failure emits a success fact, or a successful cash/provider refund has no durable fact. | Inspect transaction roots and trigger predicates; behavioral replay test against canonical fact boundary. |
| K5 | Retained prepayment is missing from the feed or duplicate cancellation creates another occurrence. | Inspect immutable history and producer idempotency; behavioral lifecycle test. |
| K6 | Existing completed/visit_confirmed history produces no patient fact or unrelated status produces one. | Behavioral signed replay test; inspect existing transition/trigger. |
| K7 | Replaying the same immutable occurrence creates another patient notification. | Behavioral endpoint/consumer test across these event families; inspect stable DB keys. |
| K8 | Consumer outage acknowledges a lost notification; exhausted attempts leave neither dead row nor operator incident. | Behavioral resident-worker test with transient/terminal faults. |
| K9 | Validly signed replay with another tenant/patient/appointment/money fact reaches the wrong patient's feed. | Behavioral signed endpoint test; inspect tenant-bound SQL reader. |
| K10 | Channel settings or suppression prevent persistent append; optional push points to a nonexistent destination. | Behavioral notify/lifecycle test for persistence; inspect destination and channel wiring (no UI/copy test). |
| K11 | Cash settlement consults a missing online provider and fails instead of accepting valid cash. | Behavioral public payment service test; inspect route classification. |
| K12 | Forward backfill misses a single agreed historical price, overwrites an ambiguous/canonical price, or crosses tenant scope. | Inspect complete data predicate and rollback-only migration execution; no SQL-text test. |
| K13 | Invalid cash amount is classified as provider failure, or link/automatic-refund provider failure loses its provider classification. | Inspect route/error-dictionary mapping; no copy assertion. |
| K14 | A parallel outbox/inbox/ledger, route-local after/send, missing owner privileges, mutable IDs, or missing hot-path index bypasses the common passage / tenant boundary. | Inspect committed diff, declarations, generated artifacts and static gates. |

## Verdict: FAIL

Candidate: `089e1f48fdbd96a672a7637792a416c4da9bcd92`.
Зафиксированная база сравнения: `dffc684124259dcf1008a46730f2a114b51c41bc`
(`git merge-base HEAD feat/doctor-ui-rebuild` при входе, как вычисляет launcher).
Worker product base — `bd2c95cc5037934d367437107530e2dfc926199e`;
между ней и базой сравнения изменён только brief. SHA проверены командой
`git rev-parse HEAD bd2c95cc5`; никаких fetch/merge свежего feat не выполнялось.

Аудит завершён; candidate **не готов к landing**. Product code и миграции не исправлялись.
Acceptance-тесты с найденными дефектами намеренно оставлены красными.

## MUST FIX

### F1 — отозванное напоминание доходит после lease

Требование: reminder generation replacement/cancellation из brief, PAT-NOTIF-01.
Worker может взять internal reminder, затем отмена/изменение offsets терминализирует queue row,
после чего уже взятый worker вызывает signed replay. Ветка `booking_lifecycle` в
`apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts:720` не перечитывает состояние
задания. Проверка актуальности ниже относится только к `appointment_reminder`.
Endpoint `apps/webapp/src/app/api/integrator/appointments/lifecycle/route.ts:146` проверяет start и
префикс identity, но не статус, актуальные offsets или отозванную generation. Поэтому пациент получает
напоминание об отменённом визите либо об уже выключенном due. Само изменение queue row в SQL этого окна не закрывает.

Воспроизведение: `pnpm --dir apps/webapp exec vitest run src/app/api/integrator/appointments/lifecycle/route.moneyReminders.route.test.ts`.
K2 краснеет для cancellation/no-show/late-cancellation и удаления offset при неизменном start:
утверждение `expect(fakes.emit).not.toHaveBeenCalled()` получает отправку. Тест использует identity,
созданную настоящим reminder producer, и фиксированное due-время; product mutation для воспроизведения не нужна.

### F2 — повтор cash route меняет деньги и создаёт новый occurrence

Требование: безопасный повтор route для каждой семьи, PAY-REL-02/PAT-NOTIF-03.
`staffAppointmentPayments.ts:369` строит cash key из последнего ledger ID, а не из стабильной identity запроса.
Повтор идентичного частичного платежа после первого commit получает новый key. Cash refund без необязательного
`requestId` имеет ту же проблему (`staffAppointmentPayments.ts:465`). HTTP-schema cash вообще не принимает
request identity; для refund она optional (`payment/route.ts:32`).

Воспроизведение: `pnpm --dir apps/webapp exec vitest run src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts`.
K7 cash: повтор суммы `3000` даёт `manualPaidMinor=6000`, ожидалось `3000`.
K7 cash refund: после оплаты `10000` повтор возврата `3000` оставляет `4000`, ожидалось `7000`.
Это лишние ledger facts и, с новым trigger, отдельные queue/feed facts. Уникальный индекс ledger не помогает:
ключи уже различны. Storage substitute возвращает ledger newest-first, как реальный
`pgPatientPayments.ts:167`; исходный in-memory port возвращает insertion order и скрывал refund-сценарий.
Оба теста красные на неизменённом candidate; DB locking/RLS ими не заявляются.

### F3 — повтор удержания порождает новый immutable history fact

Требование: одно удержание — один fact, повтор route безопасен; PAT-NOTIF-03.
Повтор `manual-cancel` с `retain_prepayment` достижим: `applyCancellation` возвращает уже отменённую запись
(`pgBookingAppointmentLifecycle.ts:648`), service отвечает `ok`, route снова вызывает
`runStaffManualCancelAfterCanonical`. `payments/service.ts:872` безусловно вызывает `appendHistoryEvent`.
В `pgPayments.ts:858` создаётся новый случайный history ID; `onConflictDoNothing()` не дедуплицирует retention.
Единственный business unique index этого журнала относится к `payment_captured`, не retention.
Новый history trigger честно превращает каждую лишнюю строку в отдельное уведомление пациента.

Воспроизведение: `pnpm --dir apps/webapp exec vitest run src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts`.
K5: `history.filter(event => event.eventType === 'prepayment_retained')` имеет длину `2` вместо `1`.
История — наблюдаемый durable side effect публичного payment service. Отсутствие retention uniqueness
подтверждено чтением схемы и DEV catalog командой из раздела DB evidence ниже; это не предположение о fake DB.

### F4 — повтор завершения визита создаёт ещё один visit fact (взгляд)

Требование: completed/visit_confirmed через существующий transition, повтор безопасен; PAT-NOTIF-03.
Повтор публичного `transitionAppointmentStatus({ appointmentId, toStatus: 'completed' })` допустим:
`appointmentStatusFsm.ts:103` принимает `from === to`, а `booking-engine/service.ts:206` всё равно вызывает port.
`pgBookingEngine.ts:2013` безусловно вставляет новый `status_changed` с новым history ID даже при одинаковом статусе.
Новый `enqueue_booking_lifecycle_from_history()` смотрит только `toStatus`, поэтому повтор превращается
в новый `visit_completed` queue/feed fact. То же относится к `visit_confirmed`.

Доказательство — чтение полной цепочки public service → FSM → транзакция → candidate trigger; новый статус или
booking workflow для воспроизведения не нужен. Живой повтор DB transition не исполнялся: preflight ниже проверяет
DDL с rollback, а не этот сценарий. Не создан тест с поддельной SQL-транзакцией, который лишь повторял бы её код.
Исправлению нужен идемпотентный producer; стабильность ключа уже созданного history ID не устраняет новый лишний ID.

### F5 — обязательный webapp lint падает на изменённом payment route

Требование: применимый lint должен пройти, AGENTS.md §24.7 и audit brief.
`pnpm --dir apps/webapp lint` → FAIL:
`doctor/booking-engine/appointments/[id]/payment/route.ts:172 response key error carries caught exception text`.
Gate `check-safe-user-error-door.mjs` признаёт `jsonError` безопасным при literal object `fallback`,
а candidate передаёт conditional expression. Это **воспроизведённый CI/static-gate blocker**, не утверждение
об утечке exception text: inspection показывает вызов существующего safe error door.
Отключать/ослаблять gate аудитор не стал. Лог: `/tmp/s11-money-audit/webapp-lint.log`.

## Результат по поверхности

| Blind ID | Результат и граница доказательства |
| --- | --- |
| K1 | PASS: публичная materialization route ставит internal job для каждого due при пустых и включённых каналах; сроки — будущие due, а не время настройки. Тест наблюдает queue-port side effect. Реальный SQL root inspected; dispatch due-index/claim остаётся общим. |
| K2 | FAIL F1. SQL terminalizes старые pending/failed_retryable/processing rows, но leased replay переживает отмену/замену. |
| K3 | PASS по конструкции: cash root вставляет immutable ledger, AFTER INSERT ставит job в той же транзакции; сбой trigger откатывает ledger. PAY-APPT-30 cash prepay/partial/full без provider проходит публичный service test. Повтор cash — FAIL F2. |
| K4 | PASS для successful refund producer: cash ledger trigger принимает refunded, provider history trigger — только refund_succeeded со status=succeeded. Provider request/failure не создаёт success history; тест provider failure имеет mutation proof. Provider createRefund возвращает created=false при том же providerRefundRef и не пишет повтор history. Cash route без requestId — FAIL F2. |
| K5 | Canonical retention history ставит job атомарно, но повтор producer — FAIL F3. |
| K6 | Валидные completed/visit_confirmed history принимаются, unrelated transition отвергается; signed replay тест и mutation proof PASS. Повтор transition producer — FAIL F4. |
| K7 | Consumer сохраняет одну запись на immutable occurrence, следующий occurrence не теряется; family matrix и mutations PASS. Producer identity не идемпотентна в F2/F3/F4. |
| K8 | PASS: все новые consumer families повторяют отказавший signed notify и сходятся после успеха; общий worker сохраняет retry, на exhaustion — dead и operator incident. Fault injections проверены. |
| K9 | PASS на HTTP-boundary: несовпадение tenant/appointment/patient/fact ID и отсутствующий money fact отвергаются; SQL reader проверен взглядом. Fake-route тесты не выдаются за доказательство RLS. |
| K10 | PASS: persisted feed проверен до suppression/channel gates для каждой новой семьи; отсутствие push не удаляет событие. Browser money/visit push открывает существующий patient screen с notifications=1, reminder — существующий /app/patient/booking. Live UI не запускался. |
| K11 | PASS: настоящий payment service принимает prepayment/partial/full cash при providers=[]; provider-dependency mutation делает тест красным. |
| K12 | PASS взглядом + owner-aware rollback-only preflight: backfill пишет только NULL canonical price, группирует по tenant+appointment и требует MIN=MAX среди non-null snapshots. Неоднозначный snapshot и уже canonical price не переписываются. После копирования cash root имеет canonical ceiling. Отдельный cash settlement после применения backfill не запускался. |
| K13 | PASS взглядом для поведения: invalid_payment_amount имеет отдельный literal rule/dictionary key; cash fallback — financials_update_failed, link/auto-refund fallback — payment_provider_unavailable. Copy/DOM тестов нет. Static gate — FAIL F5. |
| K14 | Одна очередь/лента/ledger сохранены; product diff не вводит after/direct send/второй outbox. Owners/declaration/generated artifacts проверены ниже. Immutable IDs стабильны для уже созданного факта, но source retries нарушены в F2/F3/F4. |

## Migration / privilege / DB evidence

Оба candidate SQL прочитаны целиком; `git diff dffc68412..089e1f48f -- deploy/postgres/privileges/declaration.ts`
сопоставлен с телами функций и generated SQL. Миграции не содержат GRANT/REVOKE/role/policy DDL;
это также проверено штатным migration-privilege gate, а не новым тестом текста SQL.

| Migration / объект | Реальный owner, необходимые права и результат |
| --- | --- |
| 20260918T230100: replace_appointment_reminder_generation | app_seam_reminder_materialization_owner; SELECT canonical appointment, SELECT/INSERT/UPDATE существующей queue. Сохраняет require_accepted_context, tenant equality, scoped UPDATE и проверку active appointment. Declared surfaces покрывают используемые поля. Недостаток revalidation вне SQL — F1. |
| 20260918T230100: read_booking_patient_lifecycle_fact | app_seam_payment_webhook_owner, EXECUTE только app_tenant_service. Новая typed capability требует tenant_service context и hash аргументов; SELECT column surfaces для patient_payment/history/appointments объявлены. Cash join связывает tenant+appointment+patient+cash status; history — tenant+appointment+patient/event kind и successful refund status. |
| 20260918T230100: cash/history/visit enqueue functions | app_seam_payment_webhook_owner; INSERT queue columns объявлен; IDs берутся из NEW.id immutable ledger/history. Existing appointment history trigger переиспользован; новые cash/history triggers создаёт app_object_owner с объявленным EXECUTE trigger functions. Новых таблиц нет. |
| 20260918T231000: price backfill | BCB-MIGRATION-BACKFILL, data-only от admin внутри owner-aware runner. UPDATE только NULL price через tenant+canonical appointment join, без изменения ownership/RLS/privileges. VERIFY проверяет отсутствие оставшихся однозначных repairable rows. |

Hot paths используют existing PK ledger/history, queue event_id unique, due `(status, priority DESC, next_retry_at)`
и scoped `(organization_id,status,next_retry_at)`; новых hot columns нет. Полные predicate/join и owner markers
не ослабляют tenant boundary. Для retention обнаружено отсутствие business dedup, это F3, не запрос добавить
индекс «на всякий случай».

Read-only DEV catalog, без чтения пациентских данных:

```sh
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -At -c "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('be_payment_history_events','outgoing_delivery_queue','patient_payment') ORDER BY tablename,indexname"
```

Результат: `/tmp/s11-money-audit/dev-indexes.log`; history unique — PK и capture-only index;
cash ledger имеет appointment idempotency unique; queue имеет event unique и перечисленные due indexes.

```sh
bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
```

PASS: `pending=5 total=237 unapplied=0`, явный `ROLLBACK`; лог `/tmp/s11-money-audit/preflight.log`.
Источник команды — `LOCAL_DEV_AND_AGENT_TESTING.md` §6.5. Runner и migrations — из candidate, DEV credentials
не копировались. Это проверка owner-ordered DDL/forward-backfill, не утверждение о живом полном money/feed пути.

## Слепые fault injections

Каждая временная правка сделана в product code, затем восстановлена побайтно в `finally`. Красные native
acceptance cases F1/F2/F3 являются handoff oracle и не требуют искусственно ломать уже сломанное поведение.

| ID / внесённая поломка | Команда и покрасневшее наблюдение |
| --- | --- |
| K1: убрать deliveries.push(lifecycleDelivery) | `pnpm --dir apps/webapp exec vitest run src/app/api/integrator/appointment-reminders/materialize/route.s11.route.test.ts` — ожидаемые due jobs отсутствуют. |
| K9: bypass canonical money guard в signed route | `pnpm --dir apps/webapp exec vitest run src/app/api/integrator/appointments/lifecycle/route.moneyReminders.route.test.ts -t K9` — HTTP 200 вместо 409. |
| K6: разрешить confirmed как visit-completed history | `pnpm --dir apps/webapp exec vitest run src/app/api/integrator/appointments/lifecycle/route.moneyReminders.route.test.ts -t K6` — unrelated transition получает HTTP 200 вместо 409. |
| K10: feed append разрешён только selected web_push | `pnpm --dir apps/webapp exec vitest run src/modules/patient-notifications/patientWebPushNotify.unit.test.ts -t persists` — после события нет persistent message. |
| K10: feed append запрещён при suppressExternalPush | Та же команда — после suppressed события нет persistent message. |
| K7: добавить случайный suffix в integratorMessageId | Та же команда — повтор occurrence создаёт лишнее сообщение. |
| K7: убрать occurrenceId из integratorMessageId | Та же команда — следующий occurrence исчезает. |
| K11: перед cash потребовать getPrepaymentAvailability | `pnpm --dir apps/webapp exec vitest run src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts -t 'S11 K11'` — cash отвергнут payment_provider_unavailable. |
| K4: append refund_succeeded перед adapter.refund | `pnpm --dir apps/webapp exec vitest run src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts -t 'S11 K4'` — после provider failure появился success history вместо пустого результата. |
| K8: игнорировать !result.ok signed consumer в worker | `pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/outgoingDeliveryWorker.bookingLifecycle.s11.test.ts` — failure посчитан processed, нет retry/dead. |
| K8: отключить recordBookingLifecycleReplayDeadIncident для booking_lifecycle | `pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/outgoingDeliveryWorker.bookingLifecycle.s11.test.ts -t 'opens an operator incident'` — нет operator incident. |
| K8: вернуть пустой steps для новых consumer families | `pnpm --dir apps/integrator exec vitest run src/integrations/bersoncare/bookingLifecycleRoute.patientSuppression.test.ts -t 'S11 remaining'` — отказавший consumer ложно acknowledged, promise fulfilled вместо rejection. |

Логи: `/tmp/s11-money-audit/K*.log`; recipes основной серии — `/tmp/s11-money-audit/inject.py` и
`injections.json`. Непойманных исполненных инъекций нет; разовые inspections (atomic SQL, backfill, owners)
не записаны как якобы mutation-tested. CI discovery: `.github/workflows/ci.yml` job `test-webapp-behavior`
вызывает `pnpm test:webapp:behavior`, `apps/webapp/vitest.config.ts` включает новые route и существующие unit
files. Integrator CI вызывает штатный test runner; файл patientSuppression уже в его include и реально исполнен.

Подсчёт фактически исполненных красных injection logs:

```sh
python3 - <<'PY'
from pathlib import Path
files=sorted(Path('/tmp/s11-money-audit').glob('K*.log'))
not_red=[p.name for p in files if 'AssertionError:' not in p.read_text() and 'Error: payment_provider_unavailable' not in p.read_text()]
print({'mutation_logs':len(files),'not_red':len(not_red),'names':not_red})
PY
```

Результат: `mutation_logs=12, not_red=0, names=[]`. Каждое падение отдельно прочитано и сопоставлено
с ожидаемым assertion в таблице, а не принято по одному exit code.

## Выполненные проверки

Точные команды исходного targeted набора:

```sh
pnpm --dir apps/webapp exec vitest run src/modules/booking-notifications/appointmentReminderMaterialization.test.ts src/app/api/integrator/appointments/lifecycle/route.route.test.ts src/infra/repos/pgPatientPayments.appointmentCash.unit.test.ts src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts src/modules/payments/providerWebhookSettlement.test.ts src/modules/payments/service.test.ts src/modules/payments/service.mechanicWriteClearance.test.ts src/modules/patient-notifications/patientWebPushNotify.unit.test.ts
pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/outgoingDeliveryWorker.bookingLifecycle.s11.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.reminderGeneration.d21.test.ts src/integrations/bersoncare/bookingLifecycleRoute.d14.test.ts src/integrations/bersoncare/bookingLifecycleRoute.dedup.test.ts src/integrations/bersoncare/bookingLifecycleRoute.emptyAudience.test.ts src/integrations/bersoncare/bookingLifecycleRoute.patientSuppression.test.ts src/integrations/bersoncare/bookingLifecycleRoute.portContext.test.ts src/integrations/bersoncare/bookingLifecycleRoute.reminderPlan.test.ts src/integrations/bersoncare/bookingLifecycleRoute.stepIsolation.test.ts src/integrations/bersoncare/bookingLifecycleSchema.organizationScope.acceptance.test.ts
```

Результаты этих команд на исходном candidate: webapp `53 passed`, integrator `73 passed`;
логи `webapp-targeted.log`, `integrator-targeted.log` в `/tmp/s11-money-audit/`.

После добавления acceptance и восстановления мутаций:

```sh
pnpm --dir apps/webapp exec vitest run src/modules/booking-notifications/appointmentReminderMaterialization.test.ts src/app/api/integrator/appointments/lifecycle/route.route.test.ts src/app/api/integrator/appointments/lifecycle/route.moneyReminders.route.test.ts src/app/api/integrator/appointment-reminders/materialize/route.s11.route.test.ts src/infra/repos/pgPatientPayments.appointmentCash.unit.test.ts src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts src/modules/payments/providerWebhookSettlement.test.ts src/modules/payments/service.test.ts src/modules/payments/service.mechanicWriteClearance.test.ts src/modules/patient-notifications/patientWebPushNotify.unit.test.ts
```

`68 passed / 8 failed`, `webapp-final.log`. Красные только F1 (K2) и F2/F3 (K7/K5);
тексты assertions приведены выше. F4/F5 — findings по inspection/static gate, не спрятанные skipped cases.

| Команда | Результат |
| --- | --- |
| `pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/outgoingDeliveryWorker.bookingLifecycle.s11.test.ts src/integrations/bersoncare/bookingLifecycleRoute.patientSuppression.test.ts` | PASS, 11 tests после восстановления, integrator-final.log. |
| `pnpm --dir apps/webapp exec vitest run src/modules/patient-notifications/patientWebPushNotify.unit.test.ts` | PASS, 12 tests после последней suppression mutation и отдельного assertion сразу после suppressed append; feed-restored.log. |
| `pnpm --dir apps/webapp typecheck` | PASS; повторён с acceptance additions. |
| `pnpm --dir apps/integrator typecheck` | PASS; повторён с acceptance additions. |
| `pnpm --dir apps/webapp lint` | FAIL F5; ESLint и предшествующие migration privilege/order gates прошли. |
| `pnpm --dir apps/integrator lint` | PASS. Изменённый acceptance file дополнительно прошёл targeted ESLint. |
| `pnpm --dir apps/webapp exec eslint src/app/api/integrator/appointments/lifecycle/route.moneyReminders.route.test.ts src/app/api/integrator/appointment-reminders/materialize/route.s11.route.test.ts src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts src/modules/patient-notifications/patientWebPushNotify.unit.test.ts` | PASS. |
| `pnpm --dir apps/integrator exec eslint src/integrations/bersoncare/bookingLifecycleRoute.patientSuppression.test.ts` | PASS. |
| `node deploy/postgres/privileges/generate-cli.mjs --check && node deploy/postgres/privileges/generate-cli.mjs --all --check --port-context-only` | PASS, generated artifacts dev/test/prod совпадают побайтно; это offline generation check, не подключение к PROD. |
| `pnpm test:db-privileges` | PASS: 188 passed, 203 opt-in skipped, 0 failed; privileges.log. Пропущенные DB proofs не объявляются пройденными. |
| `node deploy/postgres/privileges/generate-cli.mjs --census` | PASS по всем declaration profiles; census.log. Offline source census. |
| `node apps/webapp/scripts/check-safe-user-error-door.mjs --self-test --self-test-only && node apps/webapp/scripts/check-safe-error-transport.mjs && node apps/webapp/scripts/check-safe-error-transport.mjs --self-test && node apps/webapp/scripts/check-appointment-word-single-source.mjs && node apps/webapp/scripts/check-appointment-word-single-source.mjs --self-test && node apps/webapp/scripts/check-notification-text-coverage.mjs --self-test && node apps/webapp/scripts/check-notification-text-coverage.mjs` | PASS для хвоста lint после отказавшего gate; F5 этим не отменяется. |
| `git diff --check` | PASS. |

Запрещённые execute/full CI/live UI/deploy/push не запускались. Новые тесты не проверяют DOM/copy/source text;
ничего не пишет fixture data в DEV. Product diff после fault injections восстановлен; сохраняются только
этот artifact и acceptance tests. S11/PAY-APPT-30 checkbox/карточка не менялись.

Handoff: исправить F1–F5, прогнать сохранённый красный набор и обязательный lint. Ни этот FAIL, ни зелёные
изолированные проверки не закрывают S11 и не разрешают landing.


## Correction F1–F5 — 19.09.2026

Correction исходного audit `83b7da2b9`, база рабочего дерева `b0a480084` (`git log -3 --oneline`).
Новый blind-pass/kill-set не запускался. Исторический FAIL выше сохранён; S11/taskdb не закрываются.

| Finding | Исправленный общий root / identity и подтверждение |
| --- | --- |
| F1 | Signed `appointments/lifecycle` проверяет canonical status/start/due/offset, затем вызывает существующий `replaceGeneration` с `checkOccurrence`. Тот же `app.replace_appointment_reminder_generation(uuid,uuid,timestamptz,text,text)` принимает read-only `operation=read`: exact `event_id=booking.lifecycle:reminder_due:<reminderId>`, tenant/appointment/payload identity, active queue status, canonical status/start/deleted_at и configured due обязательны. Dead/replaced lease не доставляется; отдельной таблицы/route-памяти нет. Красные K2 теперь PASS; SQL generation predicate проверен чтением, не объявляется live runtime proof. |
| F2 | `AppointmentPaymentSection` сохраняет requestId после неуспешной попытки; HTTP schema пропускает его в `createPayment/refundPayment`. Cash key — `staff-appointment-cash:<appointmentId>:<requestId>`, refund сохраняет уже существующий explicit requestId без переписывания. Для старых вызовов без ID ключ стабилен от appointment + исходной суммы/purpose (`remaining` для отсутствующей суммы), никогда от ledger state; новый осознанный платёж требует новой identity. `settle_appointment_cash_prepayment(text)` / `refund_appointment_cash_payment(text)` после existing appointment `FOR UPDATE` ищут тот же ledger key ДО проверки остатка и отвергают несовпадение patient/amount/currency/kind/status. Повтор не INSERT-ит ledger, значит AFTER INSERT не создаёт второго lifecycle fact. Красные K7 cash/refund теперь PASS. |
| F3 | `applyCancelPaymentOutcome` переиспользует history того же payment; `appendHistoryEvent` сохраняет existing `ON CONFLICT DO NOTHING`. Новый `be_payment_history_retention_uidx` закрепляет business uniqueness `(organization_id, appointment_id, payment_id) WHERE event_type='prepayment_retained'` для non-null appointment/payment, включая конкурирующие отмены. Терминальная отмена записи не переоткрывается текущей FSM; общий payment нескольких слотов сохраняет отдельное удержание каждого appointment. History/outbox остаются атомарны existing AFTER INSERT. Красный K5 теперь PASS. |
| F4 | `pgBookingEngine.transitionAppointmentStatus` блокирует canonical row, повторно применяет existing FSM и возвращает current при same-status ДО UPDATE/history/timeline. Первый переход пишет настоящий from/to и историю с existing outbox-trigger в той же транзакции. Проверено чтением полного root; живой DB transition не запускался. |
| F5 | Provider-backed `jsonError` имеет literal fallback `payment_provider_unavailable/503`, cash — literal `financials_update_failed/500`; gate не изменён. Итог webapp lint указан ниже. |

Миграция `20260918T233800_money_reminder_retry_identity.sql`: retention index создаёт `app_object_owner`;
reminder root остаётся у `app_seam_reminder_materialization_owner`, cash roots — у
`app_seam_payment_webhook_owner`. Cash SELECT/INSERT/UPDATE и appointment lock уже покрыты declaration;
для reminder добавлен только SELECT `be_appointments.appointment_reminder_offsets_minutes`, generated SQL
пересоздан штатным генератором. Новых runtime EXECUTE, таблиц, очередей, статусов и GRANT/REVOKE в migration нет.
Read occurrence использует existing queue event-id unique, retention — собственный узкий unique index.

Тесты по §10a: новых файлов/cases нет, сохранённые красные acceptance assertions не изменены.
Единственная правка теста — прежний S10 K2 «cash paid again after a full refund» получает разные
`idempotencyKey` для осознанных платежей. Oracle — явное условие correction F2 «новый осознанный платёж
той же суммы остаётся возможен с новой identity»; прежний observable `remainingMinor === 0` сохранён.
Это проверка денег через публичный service, не текста, DOM или промежуточного DTO.

Логи всех команд: `/tmp/s11-money-correction/`.

```sh
# before.log: на исходном коде 8 failed / 14 passed; после fix этот же red oracle включён в набор ниже.
pnpm --dir apps/webapp exec vitest run src/app/api/integrator/appointments/lifecycle/route.moneyReminders.route.test.ts src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts
# webapp-acceptance.log: 76 passed, 0 failed.
pnpm --dir apps/webapp exec vitest run src/modules/booking-notifications/appointmentReminderMaterialization.test.ts src/app/api/integrator/appointments/lifecycle/route.route.test.ts src/app/api/integrator/appointments/lifecycle/route.moneyReminders.route.test.ts src/app/api/integrator/appointment-reminders/materialize/route.s11.route.test.ts src/infra/repos/pgPatientPayments.appointmentCash.unit.test.ts src/app-layer/booking/staffAppointmentPayments.s10.unit.test.ts src/modules/payments/providerWebhookSettlement.test.ts src/modules/payments/service.test.ts src/modules/payments/service.mechanicWriteClearance.test.ts src/modules/patient-notifications/patientWebPushNotify.unit.test.ts
# integrator-acceptance.log: 78 passed, 0 failed.
pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/outgoingDeliveryWorker.bookingLifecycle.s11.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.reminderGeneration.d21.test.ts src/integrations/bersoncare/bookingLifecycleRoute.d14.test.ts src/integrations/bersoncare/bookingLifecycleRoute.dedup.test.ts src/integrations/bersoncare/bookingLifecycleRoute.emptyAudience.test.ts src/integrations/bersoncare/bookingLifecycleRoute.patientSuppression.test.ts src/integrations/bersoncare/bookingLifecycleRoute.portContext.test.ts src/integrations/bersoncare/bookingLifecycleRoute.reminderPlan.test.ts src/integrations/bersoncare/bookingLifecycleRoute.stepIsolation.test.ts src/integrations/bersoncare/bookingLifecycleSchema.organizationScope.acceptance.test.ts
# payment-route.log: 11 passed, 0 failed.
pnpm --dir apps/webapp exec vitest run 'src/app/api/doctor/booking-engine/appointments/[id]/payment/route.route.test.ts'
```

| Команда | Correction result |
| --- | --- |
| `pnpm --dir apps/webapp typecheck` | PASS, webapp-typecheck.log |
| `pnpm --dir apps/integrator typecheck` | PASS, integrator-typecheck.log |
| `pnpm --dir apps/webapp lint` | PASS, включая migration privilege/order, safe-user-error и их self-tests; webapp-lint.log |
| `pnpm --dir apps/integrator lint` | PASS, integrator-lint.log |
| `node deploy/postgres/privileges/generate-cli.mjs --check && node deploy/postgres/privileges/generate-cli.mjs --all --check --port-context-only` | PASS, generated artifacts соответствуют declaration; offline, без подключения к PROD |
| `node deploy/postgres/privileges/generate-cli.mjs --census` | PASS для всех declaration profiles |
| `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` | PASS, `pending=3 total=240 reapplied=0 foreign-ledger-rows=4 unapplied=0`, явный ROLLBACK; preflight.log. Только owner-aware DDL validation, без apply/ledger и live money/feed proof |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm test:db-privileges"` | FAIL: 187 passed / 1 failed / 203 opt-in skipped; privileges.log. Единственный отказ — исходный `relation-access.test.mjs` / `no direct INSERT or UPDATE grant is table-wide`, `public.support_conversation_manual_unread app_staff` |
| `git diff --check` | PASS |

Исходный privilege blocker воспроизведён без correction: `git show HEAD:deploy/postgres/privileges/<file>`
сохранил в `/tmp/s11-money-correction/baseline-privileges/` ровно `declaration.ts`, `types.ts`,
`function-census.ts`, `relation-access.ts`, `relation-access.test.mjs` с исходного `b0a480084`, затем:

```sh
node --test --test-name-pattern='no direct INSERT or UPDATE grant is table-wide' /tmp/s11-money-correction/baseline-privileges/relation-access.test.mjs
```

Тот же FAIL `public.support_conversation_manual_unread app_staff`; privileges-baseline.log.
Это blocker общего privilege gate вне F1–F5; его grant/test не правились. Correction не объявляется
полным зелёным land-ready. Execute/full CI/live/deploy/push не запускались.
