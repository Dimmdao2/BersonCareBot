# Чеклист переноса данных (backfill + reconcile)

При первом развёртывании webapp или при миграции на новую БД необходимо перенести данные из integrator в webapp и проверить целостность. Порядок обязателен.

**Актуально (2026-04):** production — **одна** PostgreSQL, схемы `integrator` и `public`; скрипты по-прежнему принимают два URL в `cutover.prod`, но они могут быть **одинаковыми**. См. [`docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`](../docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md).

## Требования к окружению

- `DATABASE_URL` — подключение к базе со схемой **`public`** (целевые таблицы webapp).
- `INTEGRATOR_DATABASE_URL` (или `SOURCE_DATABASE_URL`) — подключение для чтения схемы **`integrator`**. В **unified** production это **та же** строка, что и `DATABASE_URL` (**одна** роль PostgreSQL, одна база).
- Миграции **уже применены** (обе схемы в одной БД; legacy — две отдельные БД).

Рекомендуемая схема env:

- **prod:** `/opt/env/bersoncarebot/cutover.prod`
- **dev:** `/home/dev/dev-projects/BersonCareBot/.env.cutover.dev`

Скрипты репозитория пытаются автоматически загрузить cutover env, поэтому для cutover/backfill/reconcile/gate не нужно хранить integrator DB URL в runtime env webapp.

## Порядок выполнения

### 1. Backfill (перенос данных)

Выполнять из корня репозитория с заданными env. Сначала всегда `--dry-run`, затем `--commit`.

| #   | Скрипт                                                                  | Что переносит                                                                                                            |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | `pnpm --dir apps/webapp run backfill-person-domain -- --commit`         | Карточки пользователей, контакты, привязки мессенджеров (channel bindings), настройки уведомлений (notification topics). |
| 2   | `pnpm --dir apps/webapp run backfill-communication-history -- --commit` | История поддержки: треды, сообщения, вопросы.                                                                            |
| 3   | `pnpm --dir apps/webapp run backfill-reminders-domain -- --commit`      | Правила напоминаний, история срабатываний, доступ к контенту.                                                            |
| 4   | `pnpm --dir apps/webapp run backfill-appointments-domain -- --commit`   | Записи на приём (appointment records).                                                                                   |

Subscription/mailing backfill больше не является активным шагом: Track D8 доказал отсутствие live producer и
удалил source/projection tables migration-forward через `0275_retire_dead_mailing_domain.sql`. Удалённый
`backfill-subscription-mailing-domain` не запускать; миграция сама отказывается удалять непустую таблицу.

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
```

При расхождениях (exit 1) — разобрать отчёт, при необходимости повторить backfill или исправить данные.
Удалённого `reconcile-subscription-mailing-domain` больше нет: D8 закрыл этот домен zero-producer census +
non-empty refusal guard в миграции, а не постоянным reconcile.

### 3. Release gate (go/no-go)

Legacy `pnpm run stage13-gate` пока не является активной командой этого чеклиста: его preflight всё ещё
вызывает удалённый D8 reconcile. До отдельного Track D обновления Stage 12/13 orchestration запускать
оставшиеся domain reconcile из §2 напрямую.

## Интеграция в deploy

По умолчанию deploy-скрипты выполняют миграции и рестарт сервисов. Backfill/reconcile остаются отдельным шагом.
Legacy `deploy/host/run-stage13-cutover.sh` и `RUN_STAGE13_CUTOVER=1` сейчас не использовать: обёртка всё ещё
содержит удалённые D8 backfill/reconcile commands. Для оставшихся доменов выполнять §1 и §2 вручную; обновление
общей Stage 12/13 orchestration относится к последующим этапам Track D.

### Integrator: retired legacy tables (Track D8)

Mailing/subscription source and projection tables were retired migration-forward in Track D8 after the exact callgraph found no live producer.

## Сохранность данных

- **Карточки и настройки пользователей:** backfill-person-domain переносит users → platform*users, identities/contacts → bindings, telegram_state (notify*_) → user*notification_topics (topic_code). Reconcile-person-domain сравнивает по integrator_user_id, phone, display_name, bindings, topics (с маппингом notify*_ → topic_code).
- **История записей на приём:** historical backfill переносил provider records в `appointment_records` по `integrator_record_id`; внешний источник выведен 2026-07-27.

Оставшиеся активные backfill-скрипты используют upsert/ON CONFLICT; повторный запуск с `--commit` безопасен и не дублирует записи при корректных ключах.

### D6: точечный досбор failed occurrence history

Миграция `0282_failed_reminder_occurrence_history` добирает только отсутствующие `failed` occurrence из схемы
`integrator` в `public.reminder_occurrence_history`. Она выполняется штатным `pnpm migrate` внутри уже существующего
migration-owner window; locked runtime-login не получает новых cross-schema прав. Вставка использует
`ON CONFLICT (integrator_occurrence_id) DO NOTHING`, поэтому повторное выполнение не создаёт дубль и не обновляет
существующую строку. Миграция fail-closed отказывается продолжать, если у отсутствующей строки нельзя доказать
`failed_at` или `organization_id`. Она не снимает `reminder_delivery_events`, `content_access_grants_webapp` или
другие проекции; их судьба определяется последующими пунктами Track D.
