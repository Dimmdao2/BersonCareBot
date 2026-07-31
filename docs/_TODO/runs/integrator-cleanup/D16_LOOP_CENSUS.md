# D16 — перепись вечных циклов и точек планирования (пересчёт поимённо)

**Статус: только перепись.** Ничего не резано, не слито, код не менян. Это ответ на требование аудита 30.07 из
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт D16: «арифметика "ровно один" сегодня не
сходится, потому что циклов и точек планирования больше, чем три; перед закрытием пункта пересчитать их поимённо
и назвать каждый, который остаётся, с причиной».

## Как искал (чтобы «больше не нашлось» было доказано, а не заявлено)

1. `grep -rn "while (true)\|while(true)"` по `apps/` (все три приложения — integrator, webapp, media-worker),
   исключая тесты — 9 совпадений, каждое открыто и прочитано (4 — реальные вечные циклы резидентных процессов,
   1 — вечный цикл в отдельном приложении media-worker, 4 — ограниченные циклы: чтение потока/pagination/pool
   воркеров с условием выхода, не циклы планирования).
2. `grep -rn "setInterval"` по `apps/` — 9 совпадений, все в `apps/webapp/src/modules/**/hooks/*.ts` —
   браузерный polling в React-хуках (клиентский код, не серверный процесс).
3. `grep -rln "node-cron\|cron.schedule\|croner"` и проверка `package.json` на cron-зависимости — пусто, в
   репозитории нет библиотеки cron/`node-cron`.
4. `node /home/dev/brain/tools/code-search.mjs "worker tick loop scheduler" --repo bcb` — вывел
   `apps/integrator/src/infra/runtime/scheduler/main.ts`, `docs/_TODO/SAAS_FOUNDATION/SAAS_C4_SCHEDULER_MEDIA_CRON_FANOUT.md`,
   `docs/ARCHITECTURE/SERVER CONVENTIONS.md` (раздел Scheduler) — это привело к отдельному процессу
   `scheduler/main.ts`, который `while(true)`-grep уже поймал, но не расшифровал.
5. Прочитан `docs/ARCHITECTURE/SERVER CONVENTIONS.md` (systemd units) и `deploy/HOST_DEPLOY_README.md` целиком по
   секциям cron/tick — там перечислены ВСЕ внешние cron-триггеры продакшена (не резидентные процессы, а
   периодические HTTP-вызовы `/api/internal/**/tick`), плюс шаблоны `deploy/host/cron.d/*.template` и скрипт
   `deploy/host/web-push-only-reminder-cron.sh`.
6. `grep -rln "planDue\|dispatchDue\|reminderTick\|runReminderTick"` по `apps/webapp/src` — нашёл модули напоминаний
   в вебаппе (`planDueReminderOccurrences.ts`, `webPushOnlyScheduler.ts`, `dispatchDueReminders.ts`,
   `reminderDispatch.ts`) и связанный internal-роут `specialist-task-reminders/tick`.
7. Прочитан код каждого найденного цикла/точки (main.ts обоих runtime-процессов интегратора,
   `organizationTicks.ts`, `operatorHealthProbeTick.ts`, `jobQueuePort.ts`, `outgoingDeliveryWorker.ts`,
   `scripts/integrator-push-outbox-tick.ts`, `operator-health-probe.sh`,
   `operatorHealthProbeRoute.ts`, `client-boot-report/route.ts`, `libraryMultipartUpload.ts`,
   `pgProgramItemDiscussion.ts`) — чтобы отличить «вечный цикл планирования» от ограниченного алгоритмического
   цикла (пагинация, поток запроса, пул воркеров с концом).
8. Перечитан план: раздел D10a (три журнала доставки), D13a (потребитель настроек напоминаний в вебаппе), D14
   (закрыт — решения жизненного цикла записи), D10b/D10c (закрыты — уборка очереди, абсолютное время постановки) —
   чтобы вердикты ниже были согласованы с уже принятыми решениями, а не придуманы заново.

Ничего сверх перечисленного не нашлось — три независимых стратегии поиска (по синтаксису цикла, по
семантическому индексу, по деплой-документации/cron) сошлись на одном и том же списке.

## Таблица

### А. Резидентные процессы интегратора (systemd units, вечные `while(true)`)

Вердикт по каждому циклу — `D30_SCHEDULER_REVERSAL_PLAN.md`, раздел «Что при этом происходит с резидентными
циклами». Здесь только факты переписи.

| # | цикл / точка планирования | где в коде | что обрабатывает |
|---|---|---|---|
| A1 | `jobQueueLoop` | `apps/integrator/src/infra/runtime/worker/main.ts:64-120` → `createPostgresJobQueue` (`jobQueuePort.ts`) → таблица `message_retry_jobs` | Два независимых источника: (а) `bookingLifecycleRoute.ts:469` — отложенная постановка напоминаний о приёме; (б) `writePort.ts:1634`, мутация `message.retry.enqueue` — общий ретрай ЛЮБОГО исходящего сообщения после сбоя доставки |
| A2 | `projectionOutboxLoop` | `main.ts:121-132` → `runProjectionWorkerTick` (`projectionWorker.ts`) | Транспорт проекции canon → webapp (fanout/outbox) |
| A3 | `outgoingDeliveryLoop` | `main.ts:133-154` → `runOutgoingDeliveryWorkerTick` (`outgoingDeliveryWorker.ts`) → `public.outgoing_delivery_queue` (`db/repos/outgoingDeliveryQueue.ts`) | Единственная живая очередь исходящей доставки: попытки, отступы, «мёртвая полка» (D10b), постановка с абсолютным временем (D10c) |
| A4 | `scheduler` главный `while(true)` | `apps/integrator/src/infra/runtime/scheduler/main.ts:83-104` (отдельный unit `bersoncarebot-scheduler-prod.service`, НЕ `worker/main.ts`) | Один тик двумя подзадачами (A4a, A4b) |
| A4a | ↳ `runSchedulerOrganizationTicks` | `scheduler/organizationTicks.ts` → `schedule.tick` per-org → `scheduler.tick.reminders` → `reminders.planDue` + `reminders.dispatchDue` | Планирование и диспетчеризация напоминаний по правилам с `integrator_user_id` (бот-каналы Telegram/MAX) — отдельный от A3 механизм постановки |
| A4b | ↳ `runScheduledOperatorHealthProbeTick` | `scheduler/operatorHealthProbeTick.ts` | Синтетические health-пробы, due-gated по `intervalMs`/`lastRunAt` на пробу |

**Важное следствие для арифметики "ровно один":** только в `worker/main.ts` три цикла (A1–A3), плюс ещё один
резидентный процесс с собственным вечным циклом — `scheduler/main.ts` (A4, с двумя внутренними точками
планирования A4a/A4b). Итого **минимум 4 отдельных `while(true)` в двух процессах интегратора**, не считая
внешних cron-точек ниже.

### Б. Внешние cron-триггеры (периодический вызов HTTP-эндпоинта — тоже точка планирования)

Вердикт по каждой точке (переезжает в планировщик / остаётся cron / исчезает) — `D30_SCHEDULER_REVERSAL_PLAN.md`
раздел 1. Здесь только факты переписи.

| # | точка планирования | где в коде / деплое | что обрабатывает |
|---|---|---|---|
| B1 | `POST /api/internal/reminders/web-push-only/tick` | `apps/webapp/src/app/api/internal/reminders/web-push-only/tick/route.ts` → `planDueReminderOccurrences.ts` + `webPushOnlyScheduler.ts`; cron каждую минуту через `deploy/host/web-push-only-reminder-cron.sh` | Планирование и доставка web-push-only напоминаний — правила `reminder_rules` с `integrator_user_id IS NULL` (пациенты без бот-канала) |
| B2 | `POST /api/internal/specialist-task-reminders/tick` | `apps/webapp/src/app/api/internal/specialist-task-reminders/tick/route.ts` → `dispatchDueSpecialistTaskReminders`; cron каждые 10 мин | Напоминания врачу по `specialist_tasks` (`remind_at`, `reminder_sent_at`) — отдельный домен, никогда не был в интеграторе |
| B3 | `pnpm run integrator-push-outbox-tick` | `apps/webapp/scripts/integrator-push-outbox-tick.ts` → `runIntegratorPushWorkerTick`; по README cron/systemd timer, интервал в репозитории не зафиксирован | Дренаж `public.integrator_push_outbox` — ретраи подписанных POST вебапп → интегратор для `reminder_rule_upsert` |
| B4 | `POST /internal/operator-health-probe` + `deploy/host/operator-health-probe.sh` | `apps/integrator/src/integrations/bersoncare/operatorHealthProbeRoute.ts`; cron раз в час | Тот же набор health-проб, что A4b, но БЕЗ due-check (`isOperatorHealthProbeDue`): каждый вызов гоняет все включённые пробы мимо настроек |
| B5 | `POST /api/internal/operator-health-critical/tick` (5 мин), `.../operator-health-digest/tick` (hourly), `.../system-health-guard/tick` (15 мин) | `deploy/host/cron.d/*.template` | Операторские алерты: критичные сигналы, дневная сводка (`operator_health_alert_config.digestTime`), guard по `integrator_push_outbox` |
| B6 | media-housekeeping: `media-pending-delete/purge`, `media-multipart/cleanup`, `media-preview:tick`, `media-playback-stats/retention`, `media-hls-proxy-errors/retention`, `product-analytics/retention`, `media-transcode/reconcile` | `deploy/HOST_DEPLOY_README.md` (секции S3/медиа/аналитика) | Уборка медиатеки, ретеншн статистики, transcode-реконсиляция |

### В. Отдельное приложение (не интегратор, но вечный цикл — для полноты)

| # | цикл | где | что обрабатывает | остаётся или уходит | причина |
|---|---|---|---|---|---|
| C1 | `while (!shuttingDown)` в media-worker | `apps/media-worker/src/main.ts` (unit `bersoncarebot-media-worker-prod.service`) | FFmpeg HLS transcode, очередь `public.media_transcode_jobs` | **Вне предмета D16.** Отдельное приложение (VIDEO_HLS_DELIVERY), не интегратор, не пациентская доставка сообщений. Упомянуто явно, чтобы «единственный вечный цикл» не читалось как утверждение про весь монорепозиторий — план говорит именно про воркер интегратора. |

### Г. Найдено и отброшено — не циклы планирования (ограниченные алгоритмические циклы)

| где | что на самом деле |
|---|---|
| `apps/webapp/src/app/api/patient-app/client-boot-report/route.ts:29` | Чтение тела HTTP-запроса чанками до `done`/лимита байт — не полинг, завершается на каждом запросе. |
| `apps/webapp/src/app/app/doctor/content/library/libraryMultipartUpload.ts:168` | Пул из 4 воркеров разбирает конечный список частей S3-multipart-загрузки (`claimPart` возвращает `null` по исчерпании) — не вечный. |
| `apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts:398,638` | Пагинация чанками по 500 строк с курсором до конца выборки — обычный цикл постраничного чтения БД, не расписание. |
| `apps/webapp/src/modules/**/hooks/*.ts` (9 файлов, `setInterval(run, 20000)` и один `useMessagePolling`) | Браузерный polling в React-хуках (клиентский код в вкладке пользователя), не серверный процесс и не «цикл воркера». |

## Что блокирует сведение

1. **A2 (`projectionOutboxLoop`)** — уходит только с D10, а D10 требует точной переписи «нулевой производитель»
   перед сносом транспорта.
2. **A1 (`jobQueueLoop`/`message_retry_jobs`)** — источник напоминаний о приёме снят D13a+D13b (закрыты 31.07);
   остаётся источник общего ретрая `message.retry.enqueue`. Слияние его с очередью A3 расписано в
   `D30_SCHEDULER_REVERSAL_PLAN.md` §3 и шаг Ш7.
3. **A4a (`reminders.planDue`/`dispatchDue` для бот-каналов)** — не уходит без **D6**: чтение
   `getEnabledReminderRules` держится за FK `user_reminder_occurrences.rule_id ON DELETE CASCADE`, миграция FK
   не сделана.
4. **Судьба процесса `scheduler` целиком** (один резидентный планировщик вместо `worker` + `scheduler`) —
   развилка №1 в `D30_SCHEDULER_REVERSAL_PLAN.md`, вынесена владельцу; план построен так, что до ответа не
   блокируется.
5. **B4 дублирует A4b** — два независимых триггера одной работы, причём внешний cron идёт мимо due-gating и
   quiet-часов. Вердикт — D30 §1 (B4 исчезает, остаётся тик планировщика).

## Итог арифметики

В процессе `worker` сегодня **три** вечных цикла (A1, A2, A3), рядом — **второй резидентный процесс**
`scheduler` (A4) со своим вечным циклом и двумя точками планирования внутри, плюс **внешние cron-точки** B1–B6.
Итого минимум 4 `while(true)` в двух процессах интегратора, не считая cron.

Целевое состояние (D16 + D30): **один цикл ДОСТАВКИ** — A3 `outgoingDeliveryLoop` над `outgoing_delivery_queue`
с попытками, отступами и «мёртвой полкой». A1 вливается в него, A2 уходит с D10, A4 остаётся исполнителем по
расписанию и решений не принимает.
⛔ «Один цикл» не означает «один процесс на весь интегратор»: ни одна зрелая система не сводит планировщик и
исполнителя в один процесс (`D16_LOOP_ARCHITECTURE_RESEARCH.md`).
