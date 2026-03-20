# DB Migration: Preparation Foundation (Stage 1)

Артефакты первого подготовительного этапа до первого реального domain move.  
Связанный roadmap: [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md).

---

## 1. Table registry and ownership

Реестр построен по **SQL-миграциям** в репозитории, а не по markdown-описаниям.

### Легенда колонок

| Колонка | Смысл |
|---------|--------|
| `service` | `integrator` или `webapp` |
| `current_owner` | Кто фактически владеет записью/миграциями сейчас |
| `current_source_of_truth` | Где считается канон для продукта сегодня (может быть split) |
| `target_owner` | Целевой владелец после миграции по [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md) |
| `zone` | `platform_person` \| `patient_diary` \| `auth_infra` \| `communication_history` \| `reminders_access` \| `provider_raw_runtime` \| `analytics_audit` |
| `migration_path` | `stay` \| `backfill_then_projection` \| `read_switch_then_freeze` \| `archive_then_remove` (ориентир) |

### Integrator — core migrations

| table_name | current_owner | current_source_of_truth | target_owner | zone | migration_path | notes |
|------------|---------------|-------------------------|--------------|------|----------------|-------|
| `users` | integrator | integrator (split with webapp platform_users) | webapp master; integrator shadow optional | platform_person | backfill_then_projection | Canonical cross-channel user row today in integrator |
| `identities` | integrator | integrator | webapp bindings + integrator technical mapping | platform_person | backfill_then_projection | `(resource, external_id)` |
| `contacts` | integrator | integrator | webapp contacts layer | platform_person | backfill_then_projection | Phone/email normalized |
| `message_drafts` | integrator | integrator | webapp or stay technical | communication_history | TBD | Support/draft UX |
| `conversations` | integrator | integrator | webapp | communication_history | backfill_then_projection | Support threads |
| `conversation_messages` | integrator | integrator | webapp | communication_history | backfill_then_projection | |
| `user_questions` | integrator | integrator | webapp | communication_history | backfill_then_projection | |
| `question_messages` | integrator | integrator | webapp | communication_history | backfill_then_projection | |
| `user_reminder_rules` | integrator | integrator | webapp (product) | reminders_access | backfill_then_projection | Patient-facing rules |
| `user_reminder_occurrences` | integrator | integrator | webapp or hybrid | reminders_access | TBD | Runtime + product |
| `user_reminder_delivery_logs` | integrator | integrator | webapp analytics + integrator technical | reminders_access / analytics_audit | TBD | |
| `content_access_grants` | integrator | integrator | webapp | reminders_access | backfill_then_projection | Protected content access |
| `delivery_attempt_logs` | integrator | integrator | integrator (technical) + projection to webapp for product audit | provider_raw_runtime / analytics_audit | stay + optional projection | |
| `idempotency_keys` | integrator | integrator | integrator | provider_raw_runtime | stay | Ingress dedup |
| `schema_migrations` | integrator | integrator | integrator | provider_raw_runtime | stay | Создаётся в [migrate.ts](../../apps/integrator/src/infra/db/migrate.ts) |

### Integrator — Telegram integration

| table_name | current_owner | current_source_of_truth | target_owner | zone | migration_path | notes |
|------------|---------------|-------------------------|--------------|------|----------------|-------|
| `telegram_users` | integrator | legacy | integrator legacy / read-only | provider_raw_runtime | read_switch_then_freeze | Не канонический identity; см. schema.md |
| `telegram_state` | integrator | integrator | integrator | provider_raw_runtime | stay | Runtime state, notify flags |
| `mailing_topics` | integrator | integrator | webapp (product categories) | platform_person / provider_raw_runtime | backfill_then_projection | Переименование из `subscriptions` ([0007](apps/integrator/src/integrations/telegram/db/migrations/20260306_0007_align_mailing_topics.sql)) |
| `user_subscriptions` | integrator | integrator | webapp (product preferences) | platform_person | backfill_then_projection | FK на users.id |
| `mailings` | integrator | integrator | integrator | provider_raw_runtime | stay | Queue |
| `mailing_logs` | integrator | integrator | webapp audit optional | analytics_audit | projection optional | |

### Integrator — RubiTime integration

| table_name | current_owner | current_source_of_truth | target_owner | zone | migration_path | notes |
|------------|---------------|-------------------------|--------------|------|----------------|-------|
| `rubitime_records` | integrator | integrator | integrator (raw) | provider_raw_runtime | stay | Provider payload |
| `rubitime_events` | integrator | integrator | integrator | provider_raw_runtime | stay | Event journal |
| `rubitime_create_retry_jobs` | integrator | integrator | integrator | provider_raw_runtime | stay | Generic delivery/retry queue (расширена за пределы RubiTime: [20260310_0002](apps/integrator/src/integrations/rubitime/db/migrations/20260310_0002_expand_retry_jobs_for_generic_delivery.sql)) |

### Webapp migrations

| table_name | current_owner | current_source_of_truth | target_owner | zone | migration_path | notes |
|------------|---------------|-------------------------|--------------|------|----------------|-------|
| `platform_users` | webapp | webapp | webapp | platform_person | stay | Master platform user |
| `user_channel_bindings` | webapp | webapp | webapp | platform_person | stay | telegram/max/vk |
| `user_channel_preferences` | webapp | webapp | webapp | platform_person | stay | Per-channel prefs |
| `symptom_trackings` | webapp | webapp | webapp | patient_diary | stay | Diary |
| `symptom_entries` | webapp | webapp | webapp | patient_diary | stay | Replaces 001_diaries |
| `lfk_complexes` | webapp | webapp | webapp | patient_diary | stay | |
| `lfk_sessions` | webapp | webapp | webapp | patient_diary | stay | |
| `phone_challenges` | webapp | webapp | webapp | auth_infra | stay | Auth |
| `message_log` | webapp | webapp | webapp | analytics_audit | stay | Doctor messaging audit |
| `broadcast_audit` | webapp | webapp | webapp | analytics_audit | stay | |
| `idempotency_keys` | webapp | webapp | webapp | provider_raw_runtime | stay | Webhook idempotency |

**Примечание:** [001_diaries.sql](apps/webapp/migrations/001_diaries.sql) создаёт старые `symptom_entries` / `lfk_sessions`; [004](apps/webapp/migrations/004_symptom_trackings_and_entries.sql) и [005](apps/webapp/migrations/005_lfk_complexes_and_sessions.sql) делают `DROP` и пересоздание. Учитывать при оценке повторного прогона миграций.

---

## 2. Conflict candidates (cutover)

Таблицы и темы, требующие явного решения до cutover:

1. **Двойной user master:** `integrator.users` / `identities` / `contacts` vs `webapp.platform_users` / `user_channel_bindings` / `user_channel_preferences`.
2. **Telegram legacy:** `telegram_users` vs канон `identities` + `telegram_state`.
3. **Mailing stack:** `mailing_topics`, `user_subscriptions`, `mailings`, `mailing_logs` — продуктовый смысл vs channel-specific runtime.
4. **Reminders:** `user_reminder_occurrences` / `user_reminder_delivery_logs` — где граница между runtime и product history.
5. **Appointments read path:** `webapp` уже читает `rubitime_records` в [pgDoctorAppointments.ts](apps/webapp/src/infra/repos/pgDoctorAppointments.ts); product storage в webapp ещё не выделен.
6. **Имя параметра `booking.activeByUser`:** фактически lookup по телефону в [readPort.ts](apps/integrator/src/infra/db/readPort.ts) — влияет на canonical user id в projection.
7. **ID type mismatch:** `integrator.users.id` = `BIGSERIAL` (автоинкремент BIGINT), `webapp.platform_users.id` = `UUID`. Критично для маппинга при backfill и projection — нужна mapping table или deterministic transform.
8. **Identity model semantic mismatch:** `integrator.identities` использует `(resource, external_id)` где `resource` — произвольная строка (любой канал/интеграция). `webapp.user_channel_bindings` использует `(channel_code, external_id)` с `channel_code IN ('telegram', 'max', 'vk')`. Не 1:1 mapping: identities шире по scope.
9. **Audit path overlap:** `webapp.message_log` (doctor messaging audit) и `integrator.delivery_attempt_logs` (transport delivery attempts) — перекрывающиеся audit scopes, требуют reconciliation и dedup-стратегии при analytics migration.

---

## 3. Backup and rollback contract

### Что зафиксировано в репозитории

- **Full prod deploy** ([deploy/host/deploy-prod.sh](deploy/host/deploy-prod.sh)):
  - Перед миграциями: `sudo -n "${BACKUP_SCRIPT}" pre-migrations` где `BACKUP_SCRIPT=/opt/backups/scripts/postgres-backup.sh`.
  - Ожидается запись в `/opt/backups/postgres/pre-migrations/` (см. [HOST_DEPLOY_README.md](deploy/HOST_DEPLOY_README.md)).
  - Затем: `pnpm --dir apps/integrator run db:migrate:prod`, затем при наличии webapp unit/env — `pnpm --dir apps/webapp run migrate`.

- **Webapp-only deploy** ([deploy/host/deploy-webapp-prod.sh](deploy/host/deploy-webapp-prod.sh)):
  - **Нет** шага backup перед `pnpm --dir apps/webapp run migrate`.

- Примеры `pg_dump` в репо: [deploy/db/backup-prod.sh](deploy/db/backup-prod.sh), [deploy/db/backup-dev.sh](deploy/db/backup-dev.sh) — не обязаны совпадать с хостовым скриптом.

### Unresolved / оператор должен подтвердить на хосте

- Делает ли `/opt/backups/scripts/postgres-backup.sh pre-migrations` дамп **обеих** БД (`integrator` + `webapp`) или только одной.
- Есть ли отдельный регламент backup перед **только webapp** деплоем.

### Rollback boundaries (политика)

| Сценарий | Рекомендуемое действие |
|----------|-------------------------|
| Падение до `db:migrate:prod` integrator | Откат кода + восстановление из pre-migrations backup при необходимости |
| Падение после integrator migrate, до webapp migrate | Не продолжать webapp migrate до анализа; integrator уже изменён схему — откат только из backup или forward-fix |
| Падение после webapp migrate | Аналогично; возможна рассинхронизация схем между сервисами |

**Артефакт:** до первого data move зафиксировать в runbook хоста фактическое поведение `postgres-backup.sh` и список включаемых database names.

---

## 4. Webapp migration safeguards (blocking issues)

### Текущее состояние

- [apps/webapp/scripts/run-migrations.mjs](apps/webapp/scripts/run-migrations.mjs): перечисляет все `.sql`, сортирует, выполняет `client.query(sql)` **без**:
  - таблицы учёта применённых миграций;
  - транзакции на файл;
  - checksum / версионирования.

- [apps/integrator/src/infra/db/migrate.ts](apps/integrator/src/infra/db/migrate.ts): `schema_migrations`, транзакции, skip уже применённых, идемпотентная обработка части ошибок.

### Blocking issues до production data move в webapp

1. Повторный прогон миграций с `DROP TABLE` / деструктивной логикой (см. 004, 005) **рискует потерей данных**.
2. Нет явного **migration ledger** для webapp — нельзя безопасно нарастить только additive миграции без дисциплины.
3. **Webapp-only deploy** без pre-migration backup.

### Минимальный safeguard-set (целевой до Stage 2)

- Ввести учёт применённых миграций (аналог `schema_migrations`) или эквивалент.
- Политика: новые миграции только **additive** + идемпотентные `IF NOT EXISTS` где возможно; деструктивные — только под контролем и one-shot.
- Pre-migration backup для webapp DB при любом деплое, затрагивающем миграции.
- Документированный operator checklist pre/post migrate.

---

## 5. Projection contract draft (`integrator` → `webapp`)

### Существующая база

- Отправка: [webappEventsClient.ts](apps/integrator/src/infra/adapters/webappEventsClient.ts) → `POST /api/integrator/events`.
- Приём: [integrator/events/route.ts](apps/webapp/src/app/api/integrator/events/route.ts) → [events.ts](apps/webapp/src/modules/integrator/events.ts).
- Lookup: [deliveryTargetsPort.ts](apps/integrator/src/infra/adapters/deliveryTargetsPort.ts) → `GET /api/integrator/delivery-targets`.
- Схемы-заготовки: [contracts/integrator-events-body.json](contracts/integrator-events-body.json), [INTEGRATOR_CONTRACT.md](apps/webapp/INTEGRATOR_CONTRACT.md).

### Группы projection (целевые)

| Group | Назначение | Примеры событий (черновик) |
|-------|------------|----------------------------|
| `identity_contact` | Синхронизация person / contact / binding | `user.upserted`, `contact.linked` |
| `preferences_state` | Настройки уведомлений по каналам | `preferences.updated` |
| `message_history` | Сообщения и треды для product history | `message.recorded`, `conversation.updated` |
| `booking_provider` | Снимок записи для product appointment layer | `appointment.projected` (из rubitime payload) |
| `delivery_status` | Доставлено/не доставлено SMS и др. | `delivery.status` |
| `reminders` | Sync reminder rules и content access | `reminder.rule.upserted`, `content_access.granted` |

### Обязательные поля envelope (черновик)

- `eventType` (строка из controlled vocabulary per group)
- `eventId` (uuid или детерминированный id)
- `occurredAt` (ISO-8601)
- `idempotencyKey` (стабильный ключ для dedup на webapp)
- `payload` (typed per eventType; без `additionalProperties: true` в финале)

### Примеры формирования `idempotencyKey`

- `user.upserted` → `user.upserted:{integrator_user_id}:{updated_at_epoch_ms}`
- `contact.linked` → `contact.linked:{user_id}:{phone_normalized}`
- `message.recorded` → `message.recorded:{conversation_id}:{message_id}`
- `appointment.projected` → `appointment.projected:{rubitime_record_id}:{updated_at_epoch_ms}`
- `delivery.status` → `delivery.status:{delivery_attempt_log_id}`
- `reminder.rule.upserted` → `reminder.rule.upserted:{rule_id}:{updated_at_epoch_ms}`

Ключ должен быть стабильным при повторной отправке того же бизнес-события и уникальным между разными бизнес-событиями.

### Семантика

- **Idempotency:** повтор с тем же ключом не создаёт дубликат бизнес-записи.
- **Retry:** integrator обязан иметь durable outbox или эквивалент до гарантии доставки в webapp (сейчас часть путей кладёт ошибку в `values`, без гарантированного retry — зафиксировано как gap).
- **Acceptance:** webapp возвращает 2xx и персистит inbound; иначе integrator должен retry с backoff.
- **Raw vs product:** raw provider rows остаются в integrator; webapp хранит product projection и ссылки на external ids.

### Текущие пробелы в коде

- Durable ingest для произвольных типов: в [events.ts](apps/webapp/src/modules/integrator/events.ts) для не-diary событий — не реализовано end-to-end.
- Нет единого typed contract per `eventType` в JSON Schema.
- Reminder dispatch: [reminderDispatch.ts](apps/webapp/src/modules/integrator/reminderDispatch.ts) — не durable.
- Canonical user id: integrator часто резолвит через свою БД; нужен явный mapping к `platform_users.id` для projection.

---

## 6. First domain brief

**Первый домен для реальной миграции:** `person` + `contacts` + `channel bindings` + `notification preferences`.

### Почему первым

- От него зависят communication history, appointments projection и analytics привязка к пользователю.
- В webapp уже есть [platform_users](apps/webapp/migrations/006_platform_users.sql), [user_channel_bindings](apps/webapp/migrations/006_platform_users.sql), [user_channel_preferences](apps/webapp/migrations/003_channel_preferences.sql).
- В integrator — [users](apps/integrator/src/infra/db/migrations/core/20260306_0012_create_users.sql), [identities](apps/integrator/src/infra/db/migrations/core/20260306_0013_create_identities.sql), [contacts](apps/integrator/src/infra/db/migrations/core/20260306_0014_create_contacts.sql), плюс telegram-specific state в `telegram_state`.

### Boundary первого домена

**Входит:**

- Маппинг и синхронизация идентичности пациента и контактов в webapp master.
- Bindings мессенджеров и preferences, относящиеся к продуктовым настройкам коммуникации.

**Не входит (следующие этапы):**

- Полный перенос `conversations` / `questions`.
- Product appointment tables в webapp.
- Полный SMS analytics layer.
- Удаление `telegram_state` из integrator (остаётся как runtime).

---

## 7. Readiness checklist: `ready_for_stage_2`

Перед началом первого domain move все пункты должны быть явно отмечены как выполненные:

- [ ] **Ownership map** утверждён (этот документ + правки по решениям conflict candidates).
- [ ] **Backup/rollback contract** подтверждён на хосте для сценариев `deploy-prod` и при необходимости `deploy-webapp-prod`.
- [ ] **Webapp migration safeguards:** либо внедрён ledger + политика additive-only, либо зафиксирован исключение с ручным контролем и снимком БД.
- [ ] **Projection contract:** утверждён список `eventType` для группы `identity_contact` и `preferences_state`, idempotency и retry.
- [ ] **First domain boundary** согласован с командой.
- [ ] **Reconciliation plan:** как сравнивать counts и выборки integrator vs webapp после backfill.
- [ ] **Read-switch plan:** какие read paths переключаются и в каком порядке.
- [ ] **Definition of done** для Stage 2: критерии «домен работает в новом виде» записаны.

---

## Связанные документы

- [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md)
- [DB_STRUCTURE_AND_RECOMMENDATIONS.md](../ARCHITECTURE/DB_STRUCTURE_AND_RECOMMENDATIONS.md)
- [apps/integrator/src/infra/db/schema.md](../../apps/integrator/src/infra/db/schema.md)
- [apps/webapp/INTEGRATOR_CONTRACT.md](../../apps/webapp/INTEGRATOR_CONTRACT.md)
