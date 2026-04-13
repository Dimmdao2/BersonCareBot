# Чеклист переноса данных (backfill + reconcile)

При первом развёртывании webapp или при миграции на новую БД необходимо перенести данные из integrator в webapp и проверить целостность. Порядок обязателен.

**Актуально (2026-04):** production — **одна** PostgreSQL, схемы `integrator` и `public`; скрипты по-прежнему принимают два URL в `cutover.prod`, но они могут быть **одинаковыми**. См. [`docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`](../docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md).

## Требования к окружению

- `DATABASE_URL` — webapp (целевая схема **`public`**).
- `INTEGRATOR_DATABASE_URL` (или `SOURCE_DATABASE_URL`) — источник integrator (схема **`integrator`**; при unified — часто **тот же** `DATABASE_URL`).
- Миграции **уже применены** (обе схемы в одной БД или две отдельные БД в legacy).

Рекомендуемая схема env:

- **prod:** `/opt/env/bersoncarebot/cutover.prod`
- **dev:** `/home/dev/dev-projects/BersonCareBot/.env.cutover.dev`

Скрипты репозитория пытаются автоматически загрузить cutover env, поэтому для cutover/backfill/reconcile/gate не нужно хранить integrator DB URL в runtime env webapp.

## Порядок выполнения

### 1. Backfill (перенос данных)

Выполнять из корня репозитория с заданными env. Сначала всегда `--dry-run`, затем `--commit`.

| # | Скрипт | Что переносит |
|---|--------|----------------|
| 1 | `pnpm --dir apps/webapp run backfill-person-domain -- --commit` | Карточки пользователей, контакты, привязки мессенджеров (channel bindings), настройки уведомлений (notification topics). |
| 2 | `pnpm --dir apps/webapp run backfill-communication-history -- --commit` | История поддержки: треды, сообщения, вопросы. |
| 3 | `pnpm --dir apps/webapp run backfill-reminders-domain -- --commit` | Правила напоминаний, история срабатываний, доступ к контенту. |
| 4 | `pnpm --dir apps/webapp run backfill-appointments-domain -- --commit` | Записи на приём (appointment records). |
| 5 | `pnpm --dir apps/webapp run backfill-subscription-mailing-domain -- --commit` | Темы рассылок, подписки пользователей, логи рассылок. |

Опции (по необходимости):

- `--limit=N` — ограничить число строк (для теста).
- `--user-id=ID` — только для backfill-person-domain: перенести одного пользователя.

### 2. Reconcile (проверка целостности)

После backfill запустить reconcile по каждому домену. Exit code 0 — данные согласованы.

```bash
pnpm --dir apps/webapp run reconcile-person-domain
pnpm --dir apps/webapp run reconcile-communication-domain
pnpm --dir apps/webapp run reconcile-reminders-domain
pnpm --dir apps/webapp run reconcile-appointments-domain
pnpm --dir apps/webapp run reconcile-subscription-mailing-domain
```

При расхождениях (exit 1) — разобрать отчёт, при необходимости повторить backfill или исправить данные.

### 3. Release gate (go/no-go)

Проверка готовности к Stage 13 и дальнейшим этапам:

```bash
pnpm run stage13-gate
```

Требует успешного прохождения stage12-gate (в т.ч. projection health) и всех reconcile.

## Интеграция в deploy

По умолчанию deploy-скрипты выполняют миграции и рестарт сервисов. Backfill/reconcile остаются отдельным шагом.

- **Ручной запуск (рекомендуемо для cutover):**
  - `bash deploy/host/run-stage13-cutover.sh`
  - только проверка без записей: `bash deploy/host/run-stage13-cutover.sh --dry-run-only`
- **Автозапуск в рамках full deploy (по флагу):**
  - `RUN_STAGE13_CUTOVER=1 bash deploy/host/deploy-prod.sh`
  - только dry-run этапы: `RUN_STAGE13_CUTOVER=1 RUN_STAGE13_CUTOVER_DRY_RUN_ONLY=1 bash deploy/host/deploy-prod.sh`

Почему не включено без флага:

- Backfill идемпотентен, но тяжёлый; обычно это one-time операция после миграций/cutover.
- Reconcile и gate требуют корректных `cutover` env (два URL или один на unified).
- Для обычных релизов повторный backfill не обязателен; онлайн-изменения в `public` — **прямой SQL** из integrator там, где код переведён; HTTP projection + worker — **legacy / fallback**.

### Integrator: freeze legacy таблиц (Stage 13)

Триггеры на `mailing_topics` и `user_subscriptions` в БД integrator блокируют записи (проекция идёт в webapp). Для разовых ручных правок в той же сессии:

```sql
BEGIN;
SET LOCAL app.stage13_bypass = 'true';
-- корректирующий SQL
COMMIT;
```

См. миграцию `20260320_0002_stage13_freeze_bypass.sql` в репозитории integrator.

## Сохранность данных

- **Карточки и настройки пользователей:** backfill-person-domain переносит users → platform_users, identities/contacts → bindings, telegram_state (notify_*) → user_notification_topics (topic_code). Reconcile-person-domain сравнивает по integrator_user_id, phone, display_name, bindings, topics (с маппингом notify_* → topic_code).
- **Подписки на рассылки:** backfill-subscription-mailing-domain переносит user_subscriptions (user_id = users.id после миграции 0010) в user_subscriptions_webapp по integrator_user_id.
- **Записи на приём:** backfill-appointments-domain переносит rubitime_records в appointment_records по integrator_record_id.

Все backfill-скрипты используют upsert/ON CONFLICT; повторный запуск с `--commit` безопасен и не дублирует записи при корректных ключах.
