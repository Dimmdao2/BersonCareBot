# Live DEV audit A — owner journeys, 2026-08-17

## Итог

DEV не готов к приёмке. Аудит нашёл пять системных `MUST FIX`, из-за которых полный проход сейчас либо даёт неверный результат, либо снова занимает часы:

1. Next DEV повторно компилирует уже открытые поверхности, разрастается до гигабайтов памяти и падал со stack overflow.
2. Десятисекундный client watchdog во время такой компиляции сам создаёт ложный unsupported-client/hydration mismatch.
3. DB rate limit логина падает в постоянный in-memory fallback из-за неверной capability/grant.
4. Scheduler не может материализовать напоминания пациента.
5. Создание записи проходит, но booking lifecycle/delivery ломается сразу тремя связанными ошибками; несмотря на это, DEV отправил один confirmation email в owner sink.

Продуктовый код, схема, миграции, TEST и PROD в этой ветке не менялись. Созданная аудитом запись отменена; незакрытых тестовых записей нет.

## Граница и команды

- Authority: `runs/orchestration/live-dev-audit-a-brief-20260817.md`.
- Среда: только общий DEV `http://127.0.0.1:5200`, integrator `127.0.0.1:4200`.
- Логовые offsets до прохода измерены командой `wc -lc /tmp/bcb-common-dev-20260817.log /tmp/bcb-common-worker-20260817.log /tmp/bcb-common-scheduler-20260817.log`: webapp/integrator `195 / 18852`, worker `14 / 876`, scheduler `14 / 890`.
- Последний снимок той же командой на момент составления отчёта: webapp/integrator `3481 / 305813`, worker `14 / 876`, scheduler `77 / 3533`.
- Основные команды: `node runs/dev-interactive-audit/run.mjs` (role-isolated passes), focused persistent Playwright checks, `node runs/dev-interactive-audit/patient-booking-lifecycle.mjs`, `DEV_AUDIT_WORKERS=1 node runs/dev-interactive-audit/patient-route-crawl.mjs`.
- Все логины выполнялись тремя owner identities из брифа. Пароль, телефоны, email, user/booking/org UUID в committed evidence не сохранены.

## MUST FIX

### A-DEV-RUNNER — DEV runner не выдерживает системный проход

Достижимый сценарий: один headless Chromium, один worker, последовательное открытие страниц. Это не параллельная нагрузка.

- `rg -n "GET /app/patient 200 in 2.7min" /tmp/bcb-common-dev-20260817.log` → `/app/patient` HTTP 200 за `2.7min`, из них `application-code: 2.3min`.
- На том же открытии inbox, analytics и calendar-timezone заняли примерно `2.3min` каждый.
- `/app/patient/about` после этого оставался в compile более 60 секунд; crawl остановлен до третьего маршрута.
- `rg -n "GET /app/doctor/schedule\\?tab=work 200 in 87s|GET /app/account 200 in 62s" ...` → doctor schedule `87s`, account `62s`.
- `rg -n "Maximum call stack|Cannot read properties of undefined" ...` → runtime `TypeError ... reading 'call'`, затем `RangeError: Maximum call stack size exceeded` и unhandled rejection.
- Перед первым controlled restart next-server достигал примерно 18–19 GiB RSS. После удаления только generated `.next/dev` (`29G → 158M`) новый next-server снова вырос примерно до 8.65–9.24 GiB за около 11 минут.

Влияние: полный browser crawl нельзя считать ни законченным, ни воспроизводимым. HTTP 200 здесь не pass: сервер может одновременно печатать runtime/hydration error или отдавать страницу через минуты.

### A-BOOT-WATCHDOG — watchdog сам создаёт ложную ошибку клиента

Контрольный browser proof на реальном doctor account:

- `/app/doctor/schedule?tab=work` вернул 200 за `86798ms`;
- все 12 Next chunks получили 200;
- React fiber/props присутствовали;
- client-only клик по заголовку дня реально открыл `hours-panel` (`false → true`).

При этом через 10 секунд `/api/patient-app/client-boot-report` записал `moduleExecuted:false`, `reactMounted:false`, `failureKind:module_never_executed` для Chrome `within_matrix`, а React сообщил hydration mismatch по `#bc-app-entry-active-content` и `#bc-unsupported-client-fallback`.

Read-only root cause: inline watchdog в `clientBootWatchdog.ts` меняет `hidden` у этих блоков до поздней гидрации; серверная разметка `AppEntryRsc` после этого неизбежно отличается.

Влияние: валидный браузер получает ложный unsupported-client сигнал и красную консоль; аудит UI загрязняется системной ошибкой.

### A-AUTH-RATE-LIMIT-GRANT — login limiter теряет DB persistence

В новых логовых окнах многократно воспроизводится:

`[auth-rate-limit] database unavailable; permanently using in-memory fallback` / `auth_rate_limit_db_fallback`.

Source contract: `app.auth_rate_limit_check_and_record(...)` требует `SELECT/DELETE/INSERT` на `public.auth_rate_limit_events`, а declaration соответствующей surface выдаёт только `SELECT`.

Влияние: после первого DB exception closure limiter до рестарта процесса работает только в памяти конкретного процесса. Межпроцессный и устойчивый лимит входа отсутствует.

### A-REMINDER-WAKE — scheduled reminders не материализуются

Source/runtime proof:

- scheduler строит `sch:<organization UUID>:<wake UUID>`;
- `node -e` с двумя UUID измерил длину `77`;
- `/api/integrator/patient-reminders/materialize-wake` принимает `wakeId.max(64)`;
- unit test route использует только короткий `tick-1` и этот контрактный разрыв не покрывает;
- общий DEV многократно логировал POST 400 до restart и POST 500 после него.

Влияние: scheduler wake не доходит до materializer, поэтому расписания уведомлений нельзя принять зелёными даже если UI сохраняет настройку.

### A-BOOKING-LIFECYCLE-DELIVERY — запись создаётся, уведомления ломаются

Реальный patient UI journey:

- каталог прочитан: 4 комбинации город/услуга, у каждой были будущие слоты;
- выбран реальный будущий слот;
- `POST /api/booking/create` вернул 200 за `23.2s` и создал confirmed booking;
- после harness timeout запись однозначно найдена через `/api/booking/my`;
- recovery `POST /api/booking/cancel` вернул 200;
- read-back: запись отсутствует в upcoming и присутствует в history как `cancelled`.

Но notification path воспроизвёл сразу три ошибки:

1. Integrator трижды вызвал `/api/bersoncare/booking/lifecycle-event`; каждый ответил 502.
2. `GET /api/integrator/delivery-targets?phone=...` трижды ответил 400. Route требует `organizationId`, а integrator port передаёт только phone, хотя `sendLinkedChannelMessage` уже имеет organizationId в payload.
3. `loadAdminMessengerIdLists` выполнил direct SELECT `platform_users JOIN user_channel_bindings` под org principal и трижды получил PostgreSQL `42501`, fingerprint `0d1989829196a849`.

После этих ошибок `PRE_FORK_DEV_DELIVERY_REDIRECT` всё же отправил один confirmation email в настроенный owner sink (`relay-outbound: dispatched`). Поэтому reschedule не выполнялся: повтор создал бы ещё одну живую отправку при уже доказанном дефекте.

Влияние: запись у пациента есть, а lifecycle уведомления частично отсутствуют/дублируются между сломанными ветками. Полная цепочка create→reschedule→cancel заблокирована до исправления delivery path.

## Покрытие по ролям и owner checklist

### 1. Все страницы и интерактивные поверхности — FAIL/BLOCKED

- Global admin: первый pass дал 13 route events; system health, security, clinics, payments, booking, integrations, technical, health archive и audit log отрисовались. Analytics, commercial, app settings и auth в том проходе не дали чистого результата из-за runtime; commercial mutation отдельно прошла reversible 200→read→restore 200→read.
- Doctor/clinic owner: отдельный pass завершил 19 маршрутов: 13 содержательных, 3 пустых/вечная загрузка (`rules`, `packages`, `references`), 3 runtime timeout/abort (`communications`, `content`, один instrumented navigation). Каталоги упражнений, комплексов, тестов, рекомендаций, шаблонов программ, promo, courses и settings organization/team/billing содержательно отрисовались.
- Patient: один-worker crawl остановлен системно после `/app/patient` 2.7min и незавершённого `/app/patient/about`; до третьей страницы не дошёл.

### 2. Global admin — PARTIAL/BLOCKED

- Commercial registration tariff/trial/paid-policy reversible cycles: PASS по POST/GET/restore.
- Технические Modes/DSN, отсутствие connect-workspace backend capability, password change, manual invoice и theme save не получили независимый чистый mutation/read-back из-за runner blocker.
- Manual invoice дополнительно не запускался как живая внешняя операция.

### 3. Clinic owner — PARTIAL/BLOCKED

- Settings organization/team/billing и большая часть doctor catalog routes отрисованы.
- Working schedule: один corrected UI cycle дал POST 200, changed read-back 200, restore POST 200, restored read-back 200 за `71301ms`, но harness не сохранил field-by-field snapshot. Вердикт `INCONCLUSIVE_HARNESS`, не product FAIL; исходное состояние восстановлено.
- Первые no-POST наблюдения по schedule/availability сняты: кнопки были нажаты во время pending/disabled initial transition.
- Create/delete location, past-unlink, policies, form field CRUD, office settings, doctor-screen toggle, slug, tariff invoice и calendar appointment field persistence остаются blocked runner’ом, а не объявлены зелёными.

### 4–5. Patient profile/chat/warmup/reminders/exercise program — BLOCKED

Эти owner-critical сценарии не объявлены проверенными. Их serial запуск был остановлен после подтверждения runner blocker и живой delivery side effect. Отдельные прошлые ошибки пользователя (chat, warmup completion 500, reminders, material ratings 403, chart size, FIO, green dots/completion semantics) требуют повторного targeted pass после смены runtime режима.

### 6. Booking lifecycle — PARTIAL FAIL

- Create через UI: PASS.
- Появление в upcoming/read-back: PASS (однозначное последующее чтение перед recovery cancel).
- Cancel/recovery и history read-back: PASS.
- Reschedule: BLOCKED BY A-BOOKING-LIFECYCLE-DELIVERY, не запускался после обнаружения живой отправки.

### 7. Worker/scheduler/delivery — FAIL

- Worker log не изменился: `wc -lc` остался `14 / 876`; безопасного подтверждения обработки queue нет.
- Scheduler log вырос `14 / 890 → 77 / 3533`, но materialize endpoint постоянно 400/500.
- Booking delivery достиг integrator, затем трижды 502/42501/400 и отдельной fallback-веткой отправил email в owner sink.

### 8. Authorization vs regression — соблюдено частично

Изолированы реальные reachable failures с identity/action/status. Случайный audit curl `/api/admin/system-health` 401 исключён: это был неверно аутентифицированный вспомогательный curl, не продуктовый finding. Blank/timeout страницы не превращены в endpoint 4xx findings без точной сетевой причины.

## Harness limitations

- Первый monolithic pass упал после stack overflow и не успел сериализовать общий artifact; сохранены отдельные role/action artifacts и логовые timestamps.
- Первые schedule/availability clicks пришлись на disabled controls; эти записи переведены из `FAIL` в `INCONCLUSIVE_HARNESS`.
- Booking harness ждал browser response 30 секунд; server завершил create за 23.2 секунды, но Playwright promise всё равно истёк. Поэтому booking ID взят из server evidence, а cleanup сделан отдельным exact authenticated read-back/cancel.
- `patient-route-crawl.mjs` не пишет incremental artifact; после SIGINT доказательство первой/второй страницы осталось в общем логе. Это недостаток harness, не продуктовый результат.

## Inventory raw evidence (ignored, не коммитится)

- `runs/dev-interactive-audit/out/doctor-remaining-a.json` — 19 doctor routes, identity proof и runtime outcomes.
- `runs/dev-interactive-audit/out/doctor-bootstrap-diagnostic-a.json` — 200/chunks/React/client-control и timing `86798ms`.
- `runs/dev-interactive-audit/out/result-2026-08-17T09-17-50-711Z.json` — schedule POST/read-back/restore steps.
- `runs/dev-interactive-audit/out/patient-booking-lifecycle-2026-08-17T09-34-49-037Z.json` — patient role, catalog/slot selection и harness timeout (PII остаётся только в ignored raw).
- `runs/dev-interactive-audit/out/recover-booking-a.json` — exact recovery cancel/read-back без PII/UUID.
- `/tmp/bcb-common-dev-20260817.log` — canonical correlated webapp+integrator runtime evidence.
- `/tmp/bcb-common-worker-20260817.log`, `/tmp/bcb-common-scheduler-20260817.log` — worker/scheduler evidence.

Committed redacted summary: `docs/REPORTS/evidence/LIVE_DEV_AUDIT_A_SUMMARY_2026-08-17.json`.

## Stop condition

Аудит не может честно завершить полный owner checklist на текущем `next dev --webpack`: один последовательный маршрут занимает до 2.7 минуты, процесс снова разрастается до ~9 GiB, а сам runtime создаёт ложные client errors. Named blocker: нужен системный switch к bounded precompiled/production-like DEV runner либо исправление текущего compiler/runtime. После этого повторяются только незакрытые targeted owner paths, затем полный crawl одним проходом.
