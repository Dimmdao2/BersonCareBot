# Чеклист переноса данных (backfill + reconcile)

При первом развёртывании webapp или при миграции на новую БД необходимо перенести данные из integrator в webapp и проверить целостность. Порядок обязателен.

## Требования к окружению

- `DATABASE_URL` — webapp (целевая БД).
- `INTEGRATOR_DATABASE_URL` (или `SOURCE_DATABASE_URL`) — integrator (источник).
- Миграции **уже применены** к обеим БД (integrator и webapp).

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

Текущие скрипты деплоя (`deploy/host/deploy-prod.sh` и др.) **не запускают** backfill и reconcile автоматически. Причины:

- Backfill идемпотентен, но тяжёлый; его обычно выполняют один раз после миграций или при cutover.
- Reconcile и gate требуют двух БД (webapp + integrator) и правильных env.

**Рекомендация:** при первом деплое на новую webapp БД или при cutover выполнить шаги 1–3 вручную по этому чеклисту. При обычных обновлениях кода достаточно миграций и рестарта сервисов; повторный backfill не обязателен (проекция из integrator в webapp идёт в реальном времени через projection worker).

## Сохранность данных

- **Карточки и настройки пользователей:** backfill-person-domain переносит users → platform_users, identities/contacts → bindings, telegram_state (notify_*) → user_notification_topics (topic_code). Reconcile-person-domain сравнивает по integrator_user_id, phone, display_name, bindings, topics (с маппингом notify_* → topic_code).
- **Подписки на рассылки:** backfill-subscription-mailing-domain переносит user_subscriptions (user_id = users.id после миграции 0010) в user_subscriptions_webapp по integrator_user_id.
- **Записи на приём:** backfill-appointments-domain переносит rubitime_records в appointment_records по integrator_record_id.

Все backfill-скрипты используют upsert/ON CONFLICT; повторный запуск с `--commit` безопасен и не дублирует записи при корректных ключах.
