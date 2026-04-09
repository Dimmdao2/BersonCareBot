# PLATFORM USER MERGE

Документ фиксирует текущую целевую модель merge/dedup для `platform_users` и состояние реализации по шагам.

## Цели

- убрать появление новых кейсов `Неизвестный клиент` из Rubitime ingestion;
- исключить silent binding steal в `user_channel_bindings`;
- перевести user-owned legacy refs на canonical UUID (`platform_user_id`);
- ввести logical merge через alias (`merged_into_id`) без physical delete duplicate rows;
- выровнять read-side на canonical пользователя.

## Каноническая модель пользователя

- Canonical user: строка `platform_users` с `merged_into_id IS NULL`.
- Merged alias: строка с `merged_into_id = <canonical_id>`.
- Strong IDs:
  - `phone_normalized`
  - `integrator_user_id`
- Ограничения strong IDs:
  - `UNIQUE DEFERRABLE INITIALLY IMMEDIATE` (миграция `061_platform_users_merge.sql`).
- Merge-операция обязана работать в транзакции с:
  - deterministic row lock order;
  - `SET CONSTRAINTS ... DEFERRED`;
  - переносом dependent rows на canonical;
  - очисткой strong IDs у duplicate;
  - установкой `merged_into_id`.

## Миграции инициативы

- `061_platform_users_merge.sql`
  - `merged_into_id` + `CHECK merged_into_id <> id`;
  - index `idx_platform_users_merged_into`;
  - DEFERRABLE unique constraints на strong IDs.
- `062_platform_user_owned_refs_prepare.sql`
  - additive UUID FK-колонки `platform_user_id` в legacy user-owned таблицах;
  - transition indexes/unique indexes.
- `063_platform_user_owned_refs_backfill.sql`
  - backfill `platform_user_id` из legacy `user_id` и fallback через `tracking_id` для `symptom_entries`.
- `064_platform_user_owned_refs_enforce.sql`
  - release gate по unresolved rows;
  - `NOT NULL` для migrated tables;
  - финальные unique indexes на новых UUID refs;
  - FK для `lfk_sessions.user_id -> platform_users(id)`.

## Read/Write правила для migrated legacy таблиц

Для `symptom_*`, `lfk_*`, `user_channel_preferences`, `message_log`, `news_item_views`:

- write path: dual-write (`user_id` + `platform_user_id`);
- read path: использовать `platform_user_id`, допускается transition fallback на legacy `user_id` до cleanup-фазы;
- merge path: переносить `platform_user_id` на canonical;
- `message_log.platform_user_id` остаётся nullable (audit-safe, `ON DELETE SET NULL`).

## Интеграционный ingestion (Rubitime)

- `appointment.record.upserted` в webapp должен:
  - при наличии телефона вызывать `ensureClientFromAppointmentProjection(...)`;
  - возвращать canonical `platformUserId` и передавать его в compat booking update path;
  - при merge conflicts возвращать retryable outcome, без «угадывания» user.
- UI fallback label для appointments:
  1. canonical профиль (`display_name`/first/last),
  2. `payload_json.name`,
  3. `phone_normalized`,
  4. `Неизвестный клиент`.

## Canonical helper и no-steal semantics

Helper: `apps/webapp/src/infra/repos/pgCanonicalPlatformUser.ts`.

Базовые правила:

- lookup по телефону/integrator id — только canonical rows (`merged_into_id IS NULL`);
- follow chain по `merged_into_id` с защитой от циклов;
- >1 canonical row на strong ID — anomaly (лог + явный failure/null path).

Применение обязательно в read/write entry points (auth/support/reminder/doctor routes/ports), где раньше был direct lookup `platform_users ... LIMIT 1`.

## Что явно не входит в текущую фазу

- physical delete/archiving merged alias rows;
- удаление legacy text `user_id` колонок;
- перепривязка actor/audit полей (`author_id`, `updated_by`, и т.п.) на canonical user.

## Операционный контроль после деплоя

- Preflight: `apps/webapp/scripts/audit-platform-user-preflight.sql`
- Diagnostic audit: `apps/webapp/scripts/audit-platform-user-merge.sql`
- Минимальные проверки:
  - unresolved `platform_user_id IS NULL` в migrated tables;
  - duplicate canonical rows по strong IDs;
  - ссылки на merged aliases в таблицах, где ожидается перенос.
