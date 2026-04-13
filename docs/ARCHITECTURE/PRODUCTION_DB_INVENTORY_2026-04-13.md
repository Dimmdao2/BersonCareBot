# Production DB: инвентаризация схемы (снимок 2026-04-13)

Снимок структуры **без секретов**: получен на production-хосте командами из `SERVER CONVENTIONS.md` (`set -a && source /opt/env/bersoncarebot/webapp.prod && set +a`, затем `psql` / `pg_dump --schema-only`). Имена базы и роли — **операционные факты** с хоста; при смене окружения переснять инвентаризацию.

**Связанные документы:** `DATABASE_UNIFIED_POSTGRES.md` (модель одной БД, `public` + `integrator`), `DB_STRUCTURE.md` (логическая группировка таблиц).

---

## Кластер и подключение

| Параметр | Значение (снимок) |
|----------|-------------------|
| PostgreSQL | 16.x (сервер и `pg_dump` совпадают по major) |
| База | `bcb_webapp_prod` |
| Роль приложения | `bcb_webapp_prod` |
| Сервер (из сессии) | `127.0.0.1:5432` |

Одна база, две **схемы приложения**: `public` (канон webapp) и `integrator` (бот, очереди, Rubitime, Telegram и т.д.) — см. `DATABASE_UNIFIED_POSTGRES.md`.

---

## Расширения

| extname | extversion |
|---------|------------|
| plpgsql | 1.0 |
| btree_gist | 1.7 |

---

## Журналы миграций (важно)

В одной БД сосуществуют **разные** таблицы учёта SQL-миграций:

| Где | Таблица | Ключ | Назначение |
|-----|---------|------|------------|
| `integrator` | `integrator.schema_migrations` | `version` (PK) | Миграции integrator (`core:…`, `telegram:…`, `rubitime:…`) |
| `public` | `public.schema_migrations` | `filename` (PK), `applied_at` | Исторически: учёт файлов `apps/webapp/migrations/*.sql` |

Таблица **`webapp_schema_migrations`** на момент снимка **отсутствовала** (`to_regclass('public.webapp_schema_migrations')` → NULL). Раннер webapp в репозитории переведён на отдельный ledger `webapp_schema_migrations`, чтобы не пересекаться с `integrator.schema_migrations` при `CREATE TABLE IF NOT EXISTS` на одно имя в разных схемах и унифицированной БД — см. обсуждение в коде `apps/webapp/scripts/run-migrations.mjs`.

---

## Схема `integrator`

Оценки строк (`est_rows`) — из `pg_class.reltuples` на момент снимка; `-1` означает «статистика не собрана / неактуальна».

### Пользователи, идентичности, контакты

| Таблица | total_size (снимок) | est_rows |
|---------|---------------------|----------|
| `users` | 32 kB | 25 |
| `identities` | 64 kB | 25 |
| `contacts` | 64 kB | 10 |
| `telegram_users` | 80 kB | 3 |
| `telegram_state` | 64 kB | 23 |

### Поддержка, переписки, вопросы

| Таблица | total_size | est_rows |
|---------|------------|----------|
| `conversations` | 64 kB | 8 |
| `conversation_messages` | 48 kB | 19 |
| `user_questions` | 64 kB | 7 |
| `question_messages` | 48 kB | 11 |
| `message_drafts` | 64 kB | 1 |

### Rubitime

| Таблица | total_size | est_rows |
|---------|------------|----------|
| `rubitime_records` | 248 kB | 89 |
| `rubitime_events` | 656 kB | 206 |
| `rubitime_create_retry_jobs` | 80 kB | 7 |
| `rubitime_branches` | 24 kB | -1 |
| `rubitime_cooperators` | 24 kB | -1 |
| `rubitime_services` | 24 kB | -1 |
| `rubitime_booking_profiles` | 32 kB | -1 |
| `booking_calendar_map` | 64 kB | 6 |
| `rubitime_api_throttle` | 24 kB | -1 |

### Напоминания, рассылки, подписки

| Таблица | total_size | est_rows |
|---------|------------|----------|
| `user_reminder_rules` | 32 kB | -1 |
| `user_reminder_occurrences` | 32 kB | -1 |
| `user_reminder_delivery_logs` | 24 kB | -1 |
| `mailing_topics` | 24 kB | -1 |
| `mailings` | 16 kB | -1 |
| `mailing_logs` | 16 kB | -1 |
| `user_subscriptions` | 8192 bytes | -1 |

### Технические / очередь / настройки

| Таблица | total_size | est_rows |
|---------|------------|----------|
| `schema_migrations` | 32 kB | 51 |
| `system_settings` | 32 kB | 34 |
| `projection_outbox` | 1048 kB | 649 |
| `idempotency_keys` | 376 kB | 1248 |
| `delivery_attempt_logs` | 1280 kB | 1249 |
| `integration_data_quality_incidents` | 64 kB | 3 |
| `content_access_grants` | 24 kB | -1 |

---

## Схема `public`

### Пользователи, auth, каналы

| Таблица | total_size | est_rows |
|---------|------------|----------|
| `platform_users` | 160 kB | 73 |
| `user_channel_bindings` | 96 kB | 18 |
| `user_channel_preferences` | 104 kB | 1 |
| `user_notification_topics` | 48 kB | 60 |
| `user_oauth_bindings` | 64 kB | -1 |
| `user_pins` | 32 kB | -1 |
| `phone_challenges` | 64 kB | 0 |
| `phone_otp_locks` | 16 kB | -1 |
| `email_challenges` | 32 kB | -1 |
| `email_send_cooldowns` | 16 kB | -1 |
| `login_tokens` | 32 kB | -1 |
| `auth_rate_limit_events` | 32 kB | 12 |
| `channel_link_secrets` | 64 kB | 3 |

### Запись, каталог, филиалы (webapp booking)

| Таблица | total_size | est_rows |
|---------|------------|----------|
| `patient_bookings` | 280 kB | 87 |
| `appointment_records` | 456 kB | 93 |
| `branches` | 96 kB | 2 |
| `booking_cities` | 64 kB | -1 |
| `booking_branches` | 80 kB | -1 |
| `booking_services` | 64 kB | -1 |
| `booking_specialists` | 80 kB | -1 |
| `booking_branch_services` | 96 kB | -1 |

### Поддержка (проекция)

| Таблица | total_size | est_rows |
|---------|------------|----------|
| `support_delivery_events` | 1568 kB | 1156 |
| `support_conversation_messages` | 168 kB | 90 |
| `support_conversations` | 152 kB | 18 |
| `support_questions` | 96 kB | -1 |
| `support_question_messages` | 80 kB | -1 |

### Медиа

| Таблица | total_size | est_rows |
|---------|------------|----------|
| `media_files` | 160 kB | 65 |
| `media_folders` | 72 kB | -1 |
| `media_upload_sessions` | 144 kB | 79 |

### ЛФК, дневник, симптомы

| Таблица | total_size | est_rows |
|---------|------------|----------|
| `lfk_complexes` | 56 kB | 5 |
| `lfk_sessions` | 64 kB | 5 |
| `lfk_exercises` | 64 kB | -1 |
| `lfk_exercise_media` | 24 kB | -1 |
| `lfk_complex_exercises` | 64 kB | -1 |
| `lfk_complex_templates` | 32 kB | -1 |
| `lfk_complex_template_exercises` | 64 kB | -1 |
| `patient_lfk_assignments` | 56 kB | -1 |
| `symptom_trackings` | 72 kB | 3 |
| `symptom_entries` | 80 kB | 18 |

### Напоминания (проекция), рассылки webapp

| Таблица | total_size | est_rows |
|---------|------------|----------|
| `reminder_rules` | 160 kB | -1 |
| `reminder_occurrence_history` | 72 kB | -1 |
| `reminder_journal` | 64 kB | -1 |
| `reminder_delivery_events` | 48 kB | -1 |
| `mailing_topics_webapp` | 40 kB | -1 |
| `mailing_logs_webapp` | 40 kB | -1 |
| `user_subscriptions_webapp` | 32 kB | -1 |

### Контент, новости, онлайн-приём

| Таблица | total_size | est_rows |
|---------|------------|----------|
| `content_sections` | 64 kB | -1 |
| `content_pages` | 96 kB | -1 |
| `content_access_grants_webapp` | 48 kB | -1 |
| `news_items` | 24 kB | -1 |
| `news_item_views` | 40 kB | -1 |
| `motivational_quotes` | 48 kB | -1 |
| `online_intake_requests` | 48 kB | -1 |
| `online_intake_answers` | 32 kB | -1 |
| `online_intake_attachments` | 24 kB | -1 |
| `online_intake_status_history` | 32 kB | -1 |

### Прочее

| Таблица | total_size | est_rows |
|---------|------------|----------|
| `schema_migrations` | 32 kB | 52 |
| `system_settings` | 32 kB | 51 |
| `idempotency_keys` | 472 kB | 604 |
| `integrator_push_outbox` | 32 kB | -1 |
| `admin_audit_log` | 136 kB | -1 |
| `doctor_notes` | 48 kB | -1 |
| `reference_categories` | 48 kB | -1 |
| `reference_items` | 64 kB | -1 |
| `broadcast_audit` | 24 kB | -1 |
| `message_log` | 72 kB | 2 |

---

## Сводка по объёму

На снимке **99** отношений-таблиц в схемах `integrator` и `public` (без служебных `pg_*`). Крупнее всего по размеру на момент снимка: `integrator.delivery_attempt_logs`, `integrator.projection_outbox`, `public.support_delivery_events`, `integrator.rubitime_events`, `integrator.idempotency_keys`, `public.idempotency_keys`.

Полный DDL на дату снимка снимается командой:

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges
```

---

## Обновление документа

После крупных миграций или изменения имени БД/роли переснять инвентаризацию теми же командами и обновить этот файл (или добавить новый снимок с датой в имени).
