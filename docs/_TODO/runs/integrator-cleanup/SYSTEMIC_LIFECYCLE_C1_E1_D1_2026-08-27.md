# Track D — жизненный цикл данных и громкий отказ фона (этапы 3–4), 27.08.2026

Ветка `wt/systemic-lifecycle-20260827` от `feat/doctor-ui-rebuild@3e40130e5`.
Источник-оракул: `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, этапы 3–4
(пункты C1–C3, D1–D2, E1; C4 — защита, E2 — owner question).

Это отчёт воркера. Живая проверка на DEV/TEST здесь НЕ выполнялась (см. «Блокер и handoff»).

## Что закрыто

### C1 — полное удаление аккаунта больше не зависит от retired integrator id

`reminder_occurrence_history` не имеет FK на `platform_users`, поэтому каскад её не убирает, а
единственный DELETE, который её называл, был по `integrator_user_id`. Для пользователя без retired id
(живой замер аудитора на TEST: 130 строк у 33 пользователей) полное удаление учётной записи оставляло
всю историю напоминаний.

- `apps/webapp/src/infra/platformUserFullPurge.ts` — таблица добавлена в `CONTENT_TABLES` по
  каноническому `platform_user_id`; ветка по retired id осталась только как reconcile-хвост.
- `apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts` — одна перепись
  `WEBAPP_RETIRED_INTEGRATOR_ID_PROJECTIONS` (таблица + канонический ключ). Из неё теперь строятся
  gate-диагностика realignment, reconcile-команда CLI и purge; второй копии списка нет.
- `apps/webapp/scripts/user-phone-admin.ts` — оба реальных entrypoint синхронизированы через ту же
  перепись; `webapp-cleanup-by-integrator-id` документирован как reconcile-хвост, а не условие удаления.
- Механический гейт: `purgeCoverageGapsForRetiredIntegratorProjections()` + тест — проекция из переписи
  без удаления по каноническому ключу красит сборку.

### C3 + E1 — окно хранения истории напоминаний и `message_log`

`20260827T183500_journal_retention_covers_reminder_history_and_message_log.sql` расширяет ОДИН
закрытый корень `app.prune_retention_target` двумя ветками с bounded batch (200k, victims CTE), правами
не выдаёт и не отзывает:

- `reminder_occurrence_history_terminal` — только терминальные статусы (`sent`/`failed`/`skipped`),
  окно по `planned_at` (NOT NULL, уже ведущая колонка индекса `(status, planned_at)`); `planned`/`queued`
  не трогаются никогда — это ещё не выполненная работа;
- `message_log` — окно по `sent_at` (есть индекс).

Права приехали декларацией и генератором (`declaration.ts` → `--all`), не миграцией: у
`app_seam_retention_sweep_owner` появились `SELECT(нужные колонки) + DELETE` и seam-политики на обе
таблицы. `--check` побайтно зелёный.

Окна:

- **`message_log` — 90 суток.** Это не новая политика: действующая таблица окон
  (`docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/16-journal-retention.md`, «Правила хранения») уже
  задаёт класс «журнал с содержимым сообщения, отправленного человеку» = 90 суток
  (`integrator.delivery_attempt_logs`, `public.support_delivery_events`). `message_log` несёт `text`
  сообщения врача пациенту и `error_message` — тот же класс.
- **История напоминаний — OWNER QUESTION `OQ-REMINDER-HISTORY-WINDOW`, срок не выдуман.** Ветка,
  batch, named root, объявленная поверхность и scheduler/health-шов готовы; цель зарегистрирована в
  тике и отдаёт `skipped: 'owner_decision_pending'`, пока владелец не назовёт число. Явный
  `reminderOccurrenceHistoryRetentionDays` запускает её немедленно.

Тик остался тот же почасовой `db_journal_retention` (`maintenance.db_journal_retention.tick`) — отдельный
cron не заводился.

### Этап 3 — исполнимый реестр жизненного цикла журналов и временных хранилищ

`deploy/postgres/privileges/journal-lifecycle-registry.ts` (рядом с декларацией, из которой гейт берёт
оракул; не под `apps/*/src`, иначе production-перепись прочитала бы имена таблиц как callsite).

Для каждой физической сущности записано: зачем существует, канонический пользовательский ключ и способ
его удаления при purge, org-ключ, терминальные состояния, решение по хранению, named prune root и job,
который её реально метёт (а значит — расписание и staleness-сигнал через `CRON_JOB_REGISTRY`).

Гейт `apps/webapp/src/modules/db-retention/journalLifecycleRegistry.contract.test.ts` выводит множество
кандидатов МЕХАНИЧЕСКИ из `declaration.ts` (суффиксы `_log/_events/_queue/_sessions/_history/...` плюс
явный список неочевидных) и отказывает любой объявленной таблице, у которой нет ни записи в реестре, ни
строки «это не журнал, потому что …». Дополнительно проверяется: решённое окно обязано иметь достижимый
prune root и зарегистрированный job; открытый owner question обязан иметь стабильный id и основание;
цель из `RETENTION_SWEEP_TARGETS` без владельца в реестре — красный.

Открытые owner questions, зафиксированные реестром (это решения «спросить», а не молчание):
`OQ-REMINDER-HISTORY-WINDOW`, `OQ-TERMINAL-UPLOAD-SESSION-WINDOW` (E2 — terminal
`media_upload_sessions` в purge НЕ добавлены), `OQ-WEBHOOK-ERROR-EVENTS-WINDOW`,
`OQ-SAAS-ISOLATION-EVENTS-WINDOW`.

### C2 — здоровье доставки соответствует failure-only журналу попыток

После `20260826T170000` в `notification_delivery_attempts` не может появиться строка `success`, а
health-карточка продолжала считать оттуда `successCount`/`lastSuccessAt`. Следствие: рабочая доставка
не могла показаться зелёной, а полный отказ доставки выглядел ровно как тихий день.

- `20260827T184500_delivery_health_reads_success_from_canonical_queue.sql` — в
  `app.read_curated_system_health_pre_0196()` отказы читаются из журнала попыток, а окончательный успех и
  свежесть по каналам — из канонической очереди `outgoing_delivery_queue` (`status='sent'`, `sent_at`);
  добавлены `confirmedDeliveries24h`, `lastConfirmedDeliveryAt` и `confirmedSentLast24h` в блок очереди.
- `20260827T185000_operator_delivery_queue_health_exposes_confirmed_by_channel.sql` — узкий корень
  `app.read_operator_delivery_queue_health()` отдаёт `sentByChannel`/`lastSentAtByChannel` (он уже
  классифицировал те же строки как `is_confirmed_24h` и уже объявляет `channel/status/sent_at`).
  Читатель webapp ходит через этот корень, а не прямым SELECT: гранта на `outgoing_delivery_queue` у
  рантайм-ролей webapp нет, прямое чтение было бы 42501 на первом живом вызове.
- `classifyNotificationDeliverySystemHealthStatus` получает `confirmedDeliveries24h` и `dueBacklog`:
  подтверждённая доставка → `ok`; ноль доставок при непустом due-бэклоге → `degraded` (полный отказ не
  пишет ни одной строки отказа); ноль и ноль → `no_data` (тихий день).
- Пустой `catch` в `loadAdminNotificationDeliveryHealthMetrics` больше не превращает отказ чтения в
  «нет данных» молча — ошибка логируется.
- Success-строки в журнал попыток не возвращены (корень БД отвергает статус ≠ `failed`), третий журнал
  не заведён.

### D1 + D2 + этап 4 — медиа-очистка не теряет retry identity и не врёт о результате

- `/api/internal/media-multipart/cleanup` больше НЕ удаляет `media_files` и НЕ вызывает S3. Он передаёт
  истёкшую сессию в ту же единственную state machine (`status='pending_delete'` + `delete_attempts` /
  `next_attempt_at`), которую уже дренирует `/api/internal/media-pending-delete/purge`. Строка сессии
  остаётся жить (она — единственный носитель `s3_key` + `upload_id`) и лишь помечается `expired`, чтобы
  выпасть из селектора активных.
- `purgePendingMediaDeleteBatch` перед любым удалением делает подтверждённый `AbortMultipartUpload` для
  незавершённых сессий этой медиа-строки. Отказ abort → `schedulePendingDeleteRetry` (существующий
  bounded backoff, потолок сутки), строка остаётся retryable, `errors += 1`, ничего не удалено.
- Оба тика: `errors > 0` больше не даёт `success: true` — ни в `operator_job_status`, ни в HTTP-ответе.
- Тихих `catch` в этом потоке не осталось: провал строки логируется и оставляет её выбираемой, а не
  переводит в терминальное состояние, которое селектор больше не видит.
- **D2 уже был закрыт кодом до этого прохода** (`a38d23c96`, `stageStaleSinglePutMediaForPurge` +
  вызов из `purgePendingMediaDeleteBatch`): single-PUT `pending` без сессии имеет владельца очистки —
  тот же pending-delete lifecycle, отдельного cron нет. Замер аудитора (7 строк на TEST) — это
  накопленные строки, ждущие тика, а не отсутствие владельца. Формулировка §D2 в сводном аудите в этой
  части устарела относительно кода.

### Этап 3, последний пункт — nullable retired id

`apps/webapp/db/schema/schema.ts` объявлял `reminder_occurrence_history.integrator_user_id` как
`.notNull()`. Ни одна forward-миграция не ставила `SET NOT NULL`, generated snapshot
(`deploy/postgres/generated/prod-to-target/schema-pre.sql:27598`) содержит колонку nullable, и живой
TEST имеет NULL-строки. Это был дрейф ORM-декларации; исправлено в схеме, без миграции, без
исторического replay. `docs/ARCHITECTURE/DB_DUMPS/public_bcb_webapp_dev_schema.sql` — устаревший
дамп до Track D (в нём нет `organization_id`/`platform_user_id`), источником правды не является.

## Слепой kill-set (составлен по authority до чтения тестов) → что покраснело

| Поломка | Проверка | Результат внесения поломки |
|---|---|---|
| purge пользователя без retired id | `platformUserFullPurge.retiredIntegratorProjections.unit.test.ts` | убрал строку `reminder_occurrence_history` из `CONTENT_TABLES` → покраснели «deletes reminder_occurrence_history by platform_user_id…» и механический coverage-гейт |
| journal exceeds window | `journalRetention.unit.test.ts` | окно `message_log` = 90 из найденного класса политики; цель истории напоминаний не запускается без числа владельца |
| success absent from attempt log | `adminNotificationDeliveryHealthMetrics.unit.test.ts` | вернул `successCount` из журнала попыток → покраснели «reports ok from confirmed queue deliveries…» и «never treats a success row…» |
| total outage vs quiet day | там же | убрал ветку `dueBacklog > 0` → покраснела «separates a total outage from a quiet day» |
| S3 abort fails after DB delete | `s3MediaStorage.lifecycle.unit.test.ts` | новый тест «aborts the multipart upload BEFORE deleting anything…»: abort отказал → нет ни `s3DeleteObject`, ни DELETE, строка retryable |
| row error marked success / non-retryable | `media-multipart/cleanup/route.unit.test.ts`, `media-pending-delete/purge/route.unit.test.ts` | `errors > 0` → HTTP 500 и `success: false` в тике; строка не переводится в терминальное состояние |
| single-PUT orphan | `s3MediaStorage.lifecycle.unit.test.ts` (существующий «stages only the stale sessionless candidates…») | владелец очистки есть; поломка не воспроизводится на текущем коде |
| new journal missing lifecycle policy | `journalLifecycleRegistry.contract.test.ts` | удалил запись `public.message_log` из реестра → покраснели «leaves no declared journal/queue/temp table…» и «binds the closed-list prune targets…» |

## Проверки

- `pnpm --dir apps/webapp typecheck` — PASS.
- `pnpm --dir apps/webapp lint` — PASS (включая `check-migration-privileges` на 97 файлах миграций:
  ни одна из трёх новых миграций не выдаёт и не отзывает прав).
- `pnpm --dir apps/webapp exec vitest run` по затронутым путям (`src/modules/db-retention`,
  `src/infra/db/pruneRetentionTarget.unit.test.ts`, `src/infra/platformUserFullPurge*`,
  `src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts`, `src/app/api/internal`,
  `src/app-layer/health`) — 16 файлов, 61 тест, PASS.
- `pnpm run test:db-privileges` — 303 теста, 0 падений (140 skip — живые DB-гейты за env-флагами).
- `node deploy/postgres/privileges/generate-cli.mjs --check` — побайтно совпадает.
- `node deploy/postgres/privileges/generate-cli.mjs --census` — 208 ACTIVE relations, чисто.
- `node --test deploy/postgres/privileges/migration-order.test.mjs` — 24/24.
- Полный CI не запускался (правило §10: repo-уровня в изменении нет).

## Блокер и handoff

- **DEV-preflight миграций не выполнен: в этой сессии недоступен `sudo`** («no new privileges»),
  а `deploy/host/migrate-dev.sh` открывает базу только через локальный административный канал.
  До аудита и landing обязателен `bash deploy/host/migrate-dev.sh --preflight` из ТОЧНОГО candidate
  checkout (§1). Три новые миграции — только `CREATE OR REPLACE FUNCTION`, тела `plpgsql`/`sql`
  компилируются лишь на живой базе, поэтому preflight здесь не формальность.
- **Scheduler-ветке (этап 2 сводного аудита, B1–B3):** новых cron-задач этот проход не заводит.
  Изменена СЕМАНТИКА двух уже установленных тиков — `media.multipart.cleanup` и
  `media.pending_delete.purge` теперь краснеют при `errors > 0` (раньше писали зелёный тик с
  ошибками в meta); пороги `staleAfterSec` не менялись. Новая retention-цель `message_log` едет на уже
  работающем почасовом `maintenance.db_journal_retention.tick`. Отдельно остаются в scheduler-ветке:
  отсутствующее расписание retention HLS proxy errors и product analytics (B2) и сверка
  реестр↔шаблоны↔установленный cron (B3).
- **Владельцу:** `OQ-REMINDER-HISTORY-WINDOW` (срок хранения истории напоминаний) и
  `OQ-TERMINAL-UPLOAD-SESSION-WINDOW` (E2) блокируют только удаление строк, не код.
  `message_log` получил 90 суток по уже действующему классу политики — если журнал сообщений врача
  должен жить дольше как продуктовая история кабинета, это отдельное owner-решение.
