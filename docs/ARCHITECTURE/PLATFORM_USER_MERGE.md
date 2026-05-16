# PLATFORM USER MERGE

Документ фиксирует текущую целевую модель merge/dedup для `platform_users` и состояние реализации по шагам.

## Фаза v2 (Phase 6): integrator-side canonical merge

Полное закрытие сценария **двух разных non-null `integrator_user_id`** вынесено в отдельную инициативу: canonical-модель в БД integrator, merge двух `users.id`, переписывание `projection_outbox`, realignment webapp projection-таблиц, feature-flag и порядок «сначала integrator merge, потом webapp merge».

- **Master plan и этапы:** [`../archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/MASTER_PLAN.md`](../archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/MASTER_PLAN.md)
- **Оглавление пакета:** [`../archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/README.md`](../archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/README.md)
- **Закрытие инициативы (Stage C):** [`../archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/STAGE_C_CLOSEOUT.md`](../archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/STAGE_C_CLOSEOUT.md) — регрессия CI, targeted тесты, closure report; операционные SQL-gates на production — по [`../REPORTS/PLATFORM_MERGE_V2_CUTOVER_RUNBOOK.md`](../REPORTS/PLATFORM_MERGE_V2_CUTOVER_RUNBOOK.md) и [`../archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/sql/README.md`](../archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/sql/README.md).

### Статус v2

Реализация **Platform User Merge v2** и репозиторное закрытие зафиксированы **2026-04-10** в [`STAGE_C_CLOSEOUT.md`](../archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/STAGE_C_CLOSEOUT.md). Снятие жёсткого блокера `different_non_null_integrator_user_id` в webapp возможно **только** при включённом admin-флаге `platform_user_merge_v2_enabled` и соблюдении порядка «сначала integrator merge (при необходимости realignment webapp), затем webapp merge» — см. таблицу hard blockers и [`STAGE_5_FEATURE_FLAG_AND_FLOW_SWITCH.md`](../archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/STAGE_5_FEATURE_FLAG_AND_FLOW_SWITCH.md).

## Ручные операции и скрипты (вне UI)

Слияние и удаление учёток **предпочтительно** через продуктовые пути (кабинет врача, код `pgPlatformUserMerge`) или утилиту [`apps/webapp/scripts/user-phone-admin.ts`](../../apps/webapp/scripts/user-phone-admin.ts). Общие правила для любых SQL/скриптов, затрагивающих телефон и tier patient: [`apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md`](../../apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md). Контекст trusted phone: [`../ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`](../ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md) §8.

## Цели

- убрать появление новых кейсов `Неизвестный клиент` из Rubitime ingestion;
- исключить silent binding steal в `user_channel_bindings`;
- перевести user-owned legacy refs на canonical UUID (`platform_user_id`);
- ввести logical merge через alias (`merged_into_id`) без physical delete duplicate rows;
- выровнять read-side на canonical пользователя.

## `@bersoncare/platform-merge` и привязка телефона из мессенджера

- Пакет [`packages/platform-merge/`](../../packages/platform-merge/) содержит **`mergePlatformUsersInTransaction`**, **`pickMergeTargetId`**, **`classifyMergeFailure`** и **`applyMessengerPhonePublicBind`**: один и тот же merge-движок и тот же hot-path для integrator `user.phone.link`, webapp [`messengerPhoneHttpBindExecute.ts`](../../apps/webapp/src/modules/integrator/messengerPhoneHttpBindExecute.ts) и реэкспорт webapp [`pgPlatformUserMerge.ts`](../../apps/webapp/src/infra/repos/pgPlatformUserMerge.ts). После `pnpm install` или pull держите **`packages/platform-merge/dist`** актуальным (скрипт [`scripts/ensure-booking-sync-built.sh`](../../scripts/ensure-booking-sync-built.sh) пересобирает пакет при отсутствии экспорта **`classifyMergeFailure`** или внутренностей merge вроде **`dedupeSingletonSymptomTrackingsForMerge`** в `dist/pgPlatformUserMerge.js`).
- **Channel-link (webapp → integrator):** `POST /api/integrator/channel-link/complete` при **`409`** возвращает `error: "conflict"` и опционально **`mergeReason`** — машинный код из [`completeChannelLinkFromIntegrator`](../../apps/webapp/src/modules/auth/channelLink.ts) (например `channel_owned_by_real_user`, `channel_link_claim_rejected`, `channel_link_claim_failed`; исторически также встречаются коды вроде `phone_owned_by_other_user` из других веток). Конфликт владения каналом **не** опирается на полный merge через `pickMergeTargetId` по умолчанию: disposable stub → узкий **claim** в [`channelLinkClaim.ts`](../../apps/webapp/src/modules/auth/channelLinkClaim.ts); «живой» аккаунт → конфликт + аудит `channel_link_ownership_conflict`. Перед массовым переносом `symptom_trackings` в merge выполняется dedupe singleton-ключей (`general_wellbeing`, `warmup_feeling`) в `pgPlatformUserMerge.ts`.
- Авто-merge перед UPDATE телефона подтягивает дубликаты по **тому же номеру** и по **`integrator_user_id`**, разруливает mismatch канонического integrator-id через merge кандидатов; при логическом «hard blocker» возвращаются коды вида `merge_blocked_*`, `channel_already_bound_to_other_user`, запись в `admin_audit_log` (`messenger_phone_bind_blocked`) и **первый** deduped Telegram ping админу (integrator).
- **Инвариант одной TX (`applyMessengerPhonePublicBind`):** после **каждого** успешного автослияния в паре шагов «дубликат по телефону» / «дубликат по совпадающему integrator-пользователю» выполняется повторное разрешение UUID канала через `user_channel_bindings` (`resolveBoundPlatformUserId`): merge переносит привязки на канона, локальный указатель процесса обязан сразу указывать на активную строку `platform_users` (`merged_into_id IS NULL`). Иначе второй merge в том же проходе использует уже смерженный id и ошибочно падает `merge_blocked_ambiguous_candidates`.
- Guard **shared phone / meaningful data** в merge **не** считает `message_log` (см. `assertSharedPhoneGuard`), чтобы не блокировать слияние только из‑за журнала сообщений.
- Авто-merge имён (ветка без `manual`): **`display_name`** отдаёт предпочтение стороне с телефоном или более старой строке при одном номере на обеих; **`first_name`/`last_name`** при ровно одной стороне с телефоном — с приоритетом полностью распарсенной пары имён на одной из сторон (см. `@bersoncare/platform-merge` SQL и [`autoMergeScalarEffective.ts`](../../apps/webapp/src/infra/repos/autoMergeScalarEffective.ts)).

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

Для `symptom_*`, `lfk_*`, `user_channel_preferences`, `message_log`:

- write path: dual-write (`user_id` + `platform_user_id`);
- read path: использовать `platform_user_id`, допускается transition fallback на legacy `user_id` до cleanup-фазы;
- merge path: переносить `platform_user_id` на canonical;
- `message_log.platform_user_id` остаётся nullable (audit-safe, `ON DELETE SET NULL`).

**Снято (APP_RESTRUCTURE этап 1, webapp):** таблица `news_item_views` удалена миграцией `apps/webapp/db/drizzle-migrations/0016_drop_news_broadcast_channels.sql` — для merge больше не применяется; исторические миграции `062–064` в `apps/webapp/migrations/` отражают состояние до drop.

## Интеграционный ingestion (Rubitime)

- `appointment.record.upserted` в webapp должен:
  - при наличии телефона вызывать `ensureClientFromAppointmentProjection(...)`;
  - возвращать canonical `platformUserId` и передавать его в compat booking update path;
  - при **merge conflicts** (typed `MergeConflictError` / `MergeDependentConflictError`): событие принимается (**HTTP 202**), аудит `auto_merge_conflict`, запись в projection без неоднозначной привязки к платформенному пользователю (см. ниже «Projection ingestion — конфликты auto-merge»), без fallback «первый кандидат» и без compat `findByPhone` / `findByIntegratorId` при флаге конфликта.
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

## Strict purge и advisory locks (webapp v1)

Безвозвратное удаление (`runStrictPurgePlatformUser`) использует **`pg_advisory_xact_lock(hashtext(platform_user_id::text))`** (exclusive) в одной транзакции с preflight S3-ключей и DELETE. Конкурирующие пользовательские записи, которые иначе создали бы гонку «между preflight и DELETE», берут **`pg_advisory_xact_lock_shared`** на тот же ключ:

- `POST /api/media/presign` — `insertPendingMediaFileTx` внутри `withUserLifecycleLock(..., "shared", ...)`;
- `createPgOnlineIntakePort().createLfkRequest` (LFK) и **`createNutritionRequest`** — `pg_advisory_xact_lock_shared` сразу после `BEGIN` (одинаковый ключ `hashtext(userId)`).

**Manual merge (v1):** `runManualPlatformUserMerge` берёт **два** exclusive lock’а на отсортированной паре `(targetId, duplicateId)` в одной транзакции (`withTwoUserLifecycleLocksExclusive` в `userLifecycleLock.ts`), затем `mergePlatformUsersInTransaction(..., "manual", { resolution })` — тот же протокол ключа, что и strict purge, без гонки с shared upload/intake на том же пользователе.

**Post-commit integrator cleanup:** `deleteIntegratorPhoneData` вызывается через `getIntegratorPoolForPurge()` — при **одной БД** допускается fallback на `DATABASE_URL` с `search_path=integrator,public` (см. `platformUserFullPurge.ts`). Если очистка integrator **нужна**, но пула нет, strict purge даёт **`needs_retry`**, а не «зелёный» `completed` (`strictPlatformUserPurge.ts`).

## Что явно не входит в текущую фазу

- physical delete/archiving merged alias rows;
- удаление legacy text `user_id` колонок;
- перепривязка actor/audit полей (`author_id`, `updated_by`, и т.п.) на canonical user.

## Manual merge — preview (admin, v1)

На шаге **preview** (до вызова `POST /api/doctor/clients/merge`) webapp отдаёт **только чтение**: сравнение двух `platform_users`, привязок, счётчиков зависимостей, жёстких блокеров и полей, требующих выбора оператора.

### HTTP

- `GET /api/doctor/clients/:userId/merge-candidates` — список **других** канонических клиентов (`role = client`, `merged_into_id IS NULL`), которые делят с якорным пользователем хотя бы один идентификатор: нормализованный телефон, email (case-insensitive trim), `integrator_user_id`, либо пару `(channel_code, external_id)` в `user_channel_bindings`. Опционально `?q=` — дополнительное сужение подстрокой по id, телефону, email, имени, integrator id, `external_id` биндингов. Доступ: **admin + admin mode** (`requireAdminModeSession`). Если якорь не клиент — `400 not_client`; если якорь alias — `409 anchor_is_alias`; не найден — `404`.
- `GET /api/doctor/clients/merge-preview?targetId=&duplicateId=` — полный preview для пары (порядок задаёт UI: target = каноническая «победившая» сторона для будущего apply). Доступ: **admin + admin mode**. Оба пользователя должны быть `role = client`, иначе `400 not_client`. Ответ JSON: camelCase поля профиля, биндинги, OAuth, `dependentCounts`, `hardBlockers`, `scalarConflicts` / `channelConflicts` / `oauthConflicts`, `autoMergeScalars`, `recommendation` (эвристика `pickMergeTargetId` как подсказка UI), `mergeAllowed` (нет hard blockers), **`v1MergeEngineCallable`** (можно ли вызвать **текущий** `mergePlatformUsersInTransaction` без `MergeConflictError`: те же hard blockers **и** отсутствие пары разных non-null `phone_normalized` — иначе движок падает до dependent-guard’ов).
- `GET /api/doctor/clients/name-match-hints` — **справочный** отчёт для ручной проверки: группы канонических клиентов с одинаковыми нормализованными `first_name` + `last_name` (как в полях БД), и отдельно пары, где те же два токена встречаются в **переставленном** порядке между полями. Параметры: `missingPhone=1|true` — только строки без телефона (`phone_normalized IS NULL` или пустой trim); `limitGroups`, `limitMembersPerGroup`, `limitSwappedPairs` (числовые лимиты). Ответ включает `disclaimer`: совпадение ФИО **не** подтверждает личность (в отличие от сценария, когда клиент сам привязывает телефон к существующей записи). Логи: `action: name_match_hints` (агрегаты, без массивов ПДн). Реализация: `apps/webapp/src/infra/platformUserNameMatchHints.ts`, route `name-match-hints/route.ts`.
- `GET /api/doctor/clients/merge-user-search?q=&limit=` — поиск **любого** канонического клиента по подстроке (id, телефон, email, имена, `integrator_user_id`, `external_id` биндингов), **без** требования пересечения strong-id с якорем карточки. Логи: `action: merge_user_search` (`qLength`, `resultCount`, `durationMs`). Реализация: `searchMergeUsersForManualMerge` в `platformUserMergePreview.ts`, route `merge-user-search/route.ts`.

Реализация: `apps/webapp/src/infra/platformUserMergePreview.ts`, `platformUserNameMatchHints.ts`, маршруты в `apps/webapp/src/app/api/doctor/clients/`.

План работ и журнал фактического выполнения (включая post-audit hardening): [`ADMIN_NAME_MATCH_HINTS_PLAN_AND_EXECUTION_LOG.md`](ADMIN_NAME_MATCH_HINTS_PLAN_AND_EXECUTION_LOG.md).

### Hard blockers (совпадают с guard’ами merge engine)

| Код | Смысл |
|-----|--------|
| `target_is_alias` / `duplicate_is_alias` | `merged_into_id IS NOT NULL` — merge alias в паре недопустим. |
| `different_non_null_integrator_user_id` | **v1** (флаг `platform_user_merge_v2_enabled` выкл.): оба `integrator_user_id` заданы и **различны** — **жёсткий запрет** (риск phantom user / рассинхрон проекций). |
| `integrator_canonical_merge_required` | **v2** (флаг вкл.): оба id заданы и различны, но в БД integrator canonical `users.id` ещё **не** совпали — сначала `mergeIntegratorUsers`, при необходимости realignment проекций webapp, затем снова preview. |
| `integrator_merge_status_unavailable` | **v2:** не удалось получить integrator M2M `canonical-pair` status (нет `INTEGRATOR_API_URL`/webhook secret, timeout или иная временная недоступность). |
| `active_bookings_time_overlap` | Тот же SQL, что `assertPatientBookingsSafeToMerge` в `pgPlatformUserMerge.ts` (пересечение слотов у «активных» статусов и согласованный cooperator snapshot). |
| `active_lfk_template_conflict` | Два активных `patient_lfk_assignments` на одну `template_id` — как `assertPatientLfkAssignmentsSafe`. |
| `shared_phone_both_have_meaningful_data` | Одинаковый non-null телефон и «meaningful data» на обоих — как `assertSharedPhoneGuard` (**без** `message_log`; сумма счётчиков по остальным таблицам из merge guard). |

`mergeAllowed === false` при любом hard blocker; конфликтные поля всё равно возвращаются для compare UI.

**`mergeAllowed` vs `v1MergeEngineCallable`:** первый — только про **hard blockers** плана. Второй дополнительно отсекает пару с **двумя разными non-null телефонами**, потому что **авто**-merge (`mergePlatformUsersInTransaction` без ручного `resolution`) бросает `MergeConflictError` на этом условии (ещё до `assertSharedPhoneGuard`). **Ручной** apply (`POST /api/doctor/clients/merge` с `ManualMergeResolution`) в v1 уже разрешает телефон и остальные скаляры явно и переносит `media_files.uploaded_by`; `v1MergeEngineCallable` описывает только совместимость с **авто**-путём, не пригодность ручного merge.

### Конфликты vs auto-merge

- **Скаляры** (`phone_normalized`, `display_name`, `first_name`, `last_name`, `email`): конфликт, если оба non-null и различаются (email — без учёта регистра). Рекомендация по умолчанию: сторона с **более ранним** `created_at` (`recommendedWinner`).
- **Каналы** (`telegram`, `max`, `vk`, …): конфликт, если у обоих есть биндинг на один `channel_code`, но разный `external_id`. Рекомендация по умолчанию: older `created_at`.
- **OAuth**: конфликт по provider, если оба имеют привязку, но разный `provider_user_id` (уникальность `(provider, provider_user_id)` как в БД).
- **autoMergeScalars**: значения без конфликта; семантика effective для скаляров согласована с **авто** merge в `mergePlatformUsersInTransaction` (COALESCE и CASE для `display_name`). Для полей с **конфликтом** (оба non-null, разные значения) при **авто**-пути движок для `first_name` / `last_name` / `email` всё же выполняет `COALESCE(target, duplicate)` в SQL (приоритет target), т.е. без выбора оператора; preview показывает конфликт для compare UI, а **ручной** merge применяет выбор из `resolution.fields`. `scalarConflicts` не дублирует жёсткий блокер `different_non_null_integrator_user_id`.

### Зависимые счётчики (preview)

По каждому пользователю: `patient_bookings`, `reminder_rules` (`platform_user_id`), `support_conversations`, `symptom_trackings`, `lfk_complexes`, `media_files.uploaded_by`, `online_intake_requests`. Не заменяют полный строгий preflight purge.

## Manual merge — apply (admin, v1)

Операторский apply выполняется через **`POST /api/doctor/clients/merge`** (только **admin + admin mode**). Тело: `{ resolution: ManualMergeResolution }`. Исходный тип: `apps/webapp/src/infra/repos/manualMergeResolution.ts` (экспорт также из `pgPlatformUserMerge.ts`). Сервер дополнительно проверяет, что **обе** строки `platform_users` имеют `role = 'client'`; merge doctor/admin-аккаунтов этим маршрутом не поддерживается.

### Контракт `ManualMergeResolution` (финальный для v1)

- **`targetId` / `duplicateId`**: каноническая сторона и дубликат (становится alias с `merged_into_id = targetId`).
- **`fields`**: для каждого скаляра (`phone_normalized`, `display_name`, `first_name`, `last_name`, `email`) — `'target' | 'duplicate'`, чьё значение остаётся на канонической строке после merge.
- **`integrator_user_id` не входит в `fields`**: два **разных** non-null `integrator_user_id` — в **v1** жёсткий блокер в preview и отказ в `mergePlatformUsersInTransaction` (**как до Stage 5**, ошибка из транзакции merge, audit `user_merge` с `phase: merge_transaction`). В **v2** (`platform_user_merge_v2_enabled` в `system_settings`, admin) перед транзакцией M2M `canonical-pair` должен подтвердить одну canonical пару; manual apply пропускает relaxed-path только если snapshot проверенной пары совпал с `integrator_user_id`, перечитанными под `FOR UPDATE` в merge tx. При drift между gate и apply сервер возвращает `integrator_ids_changed_since_gate`. Операторский integrator merge: `POST /api/doctor/clients/integrator-merge` или прямой вызов integrator API (см. `docs/archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/STAGE_5_FEATURE_FLAG_AND_FLOW_SWITCH.md`).
- **`bindings`**: для `telegram`, `max`, `vk` — `'target' | 'duplicate' | 'both'`. При конфликте разных `external_id` оператор **обязан** выбрать сторону (`target` / `duplicate`); `'both'` допустим только для канала **без конфликта** (авто-перенос duplicate-only bindings на target c `ON CONFLICT DO NOTHING`).
- **`oauth`**: `Record<provider, 'target' | 'duplicate'>` — обязателен для каждого провайдера, где у обоих пользователей разные `provider_user_id`; иначе `MergeConflictError` при apply.
- **`channelPreferences`**: `'keep_target' | 'keep_newer' | 'merge'` — поведение для `user_channel_preferences` (`keep_target` удаляет строки duplicate; `keep_newer` и `merge` в v1 используют одну и ту же логику слияния по `updated_at`).

### Транзакция и переносы

- Два advisory lock **`pg_advisory_xact_lock(hashtext(...))`** на **оба** UUID в детерминированном порядке (сортировка), затем один `BEGIN…COMMIT` с `mergePlatformUsersInTransaction(..., "manual", { resolution })`.
- В транзакции: **`UPDATE media_files SET uploaded_by = target WHERE uploaded_by = duplicate`** и **`UPDATE media_upload_sessions SET owner_user_id = target WHERE owner_user_id = duplicate`** — владельцы медиа и активных multipart sessions переносятся на канона; surviving `email` сохраняет совместимый `email_verified_at`, если выбранный email уже был verified на одной из сторон; projection-таблицы по `integrator_user_id` **не** переключаются silently (при допустимом merge в v1 оба id согласованы или один null — см. план §3).
- Аудит: после успешного **`COMMIT`** — отдельная запись `admin_audit_log` с `action = user_merge`, `details.resolution`, а также `conflictsResolved: []` и `dependentRowsMoved` (v1: флаги про repoint `media_files.uploaded_by` и `media_upload_sessions.owner_user_id` в транзакции merge, без детальных счётчиков по таблицам); при ошибке транзакции — запись со `status: error` после rollback (политика отдельной транзакции).

### Projection ingestion — конфликты auto-merge

Репозиторий (`pgUserProjection.ts` и т.п.) по-прежнему **пробрасывает** `MergeConflictError` / `MergeDependentConflictError` без решения HTTP. Решение **`202` vs `503`** принимается в **`modules/integrator/events.ts`**: при подключённом `conflictAudit` конфликт класса merge → `upsertOpenConflictLog` / `writeAuditLog(anomaly)` → **`accepted: true`** (маршрут `POST /api/integrator/events` отвечает **202**), без мутации identity для identity-событий (`user.upserted`, `contact.linked`, `preferences.updated`). Для **`appointment.record.upserted`**: `ensureClientFromAppointmentProjection` запускается по нормализованному телефону из top-level payload **или** `payloadJson.phone`; при конфликте — аудит, запись в projection-таблицу записи, **без** fallback `findByPhone` / `findByIntegratorId` и без привязки `userId` в compat-path (`userId: null` в `applyRubitimeUpdate`). Повторы того же набора кандидатов увеличивают `repeat_count` и дополняют `seenEventTypes` в открытой строке `auto_merge_conflict` (ключ `sha256(sorted(candidateIds))`). `MergeDependentConflictError` **обязан** нести `candidateIds` (как `MergeConflictError`) для стабильного `conflict_key`.

### Ограничения v1 и v2 (после закрытия инициативы)

- При **`preferences.updated`** и конфликте: событие подтверждается (`202`), topics **не** пишутся до ручного разрешения; отдельного replay нет — следующее «чистое» событие после разрешения конфликта.
- Merge **разных** non-null `integrator_user_id`: в режиме **v1** (флаг `platform_user_merge_v2_enabled` **выкл.**) — жёсткий запрет (`different_non_null_integrator_user_id`). В режиме **v2** (флаг **вкл.**) — сначала canonical merge в integrator и при необходимости realignment проекций webapp, затем ручной webapp merge; блокеры `integrator_canonical_merge_required` / `integrator_merge_status_unavailable` см. в таблице hard blockers выше. Закрытие инициативы и чеклисты: [`STAGE_C_CLOSEOUT.md`](../archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/STAGE_C_CLOSEOUT.md).

## Admin UI — ручной merge (карточка клиента)

Доступ: **только** `role === admin` и включённый **admin mode** (тот же guard, что `POST .../merge` и `GET .../merge-preview`; на карточке используется тот же флаг, что и для безвозвратного удаления).

Поверхность: `/app/doctor/clients/[userId]` и колонка деталей на `/app/doctor/clients` — блок **«Объединение учётных записей (admin)»** внутри аккордеона карточки (`ClientProfileCard` → `AdminMergeAccountsPanel`). Отдельная страница **`/app/doctor/clients/name-match-hints`** (только admin + admin mode): кнопка «Запустить поиск» по отчёту `name-match-hints`, ссылка из списка клиентов при том же guard.

**Integrator proxy — фантомный `integrator_user_id` у дубликата:** если M2M `POST /api/integrator/users/merge` возвращает `USER_NOT_FOUND` и в теле указано, что отсутствует **только** integrator id стороны **дубликата** (`missingIntegratorUserIds`), webapp **`POST /api/doctor/clients/integrator-merge`** (без `dryRun`) обнуляет `platform_users.integrator_user_id` у дубликата, пишет audit `integrator_user_merge` со статусом ok и `phase: orphan_duplicate_integrator_id_cleared`; после этого можно обновить preview и выполнить обычный webapp merge. При `dryRun: true` в том же случае возвращается подсказка без записи в БД.

Операторский поток:

1. Открыть раздел аккордеона «Объединение…» → загрузка **`GET /api/doctor/clients/:userId/merge-candidates`** (опционально поиск `q`).
2. Вторая запись: выпадающий список по пересечениям **или** поле **`merge-user-search`** (минимум 2 символа) → выбор UUID второй стороны.
3. **Канон после merge:** радиокнопки «текущая карточка» / «вторая выбранная запись» задают пару `(targetId, duplicateId)` для первого запроса preview.
4. **Подстройка под рекомендацию preview:** чекбокс по умолчанию включён — если эвристика `recommendation` задаёт другую ориентацию target/duplicate, UI **перезапрашивает** preview с `suggestedTargetId` / `suggestedDuplicateId`. Если чекбокс **выкл.**, остаётся ориентация из п.3 без второго fetch (`resolveMergePreviewAlignment` в `adminMergeAccountsLogic.ts`).
5. **`GET /api/doctor/clients/merge-preview?targetId=&duplicateId=`** — далее как раньше.
6. **Side-by-side** таблица скаляров, отдельные строки для каналов `telegram` / `max` / `vk` и OAuth-конфликтов; для конфликтных полей — radio; для конфликтных каналов оператор выбирает только `target` / `duplicate`, а для каналов без конфликта отображается авто-поведение (`both`).
7. **Жёсткие блокировки** (`hardBlockers`): отдельный блок с русскими пояснениями по коду; кнопка merge **неактивна**, пока `mergeAllowed === false` или список блокеров непустой (`canSubmitManualMerge` дублирует это на клиенте; сервер снова валидирует в транзакции).
8. Если **`mergeAllowed`** и нет блокеров, но **`v1MergeEngineCallable === false`**: краткое пояснение, что авто-merge (v1) для пары недоступен; ручной merge с выбранным `resolution` остаётся допустимым.
9. **Финальный предпросмотр** (текстовый список итоговых решений) перед кнопкой.
10. **Двойное подтверждение**: `window.confirm` с предупреждением, затем ввод **UUID дубликата** (`duplicateId`); сравнение **без учёта регистра** hex, как для purge с подтверждением id.
11. **`POST /api/doctor/clients/merge`** с `{ resolution }` из состояния UI (`buildDefaultManualMergeResolution` + правки оператора). Ответы без JSON или `403` показываются отдельным текстом.

Отдельный раздел аккордеона **«История операций (admin)»**: **`GET /api/admin/audit-log?involvesPlatformUserId=<текущий uuid>`** — строки, где пользователь в `target_id` или в `details.candidateIds` у `auto_merge_conflict`; локальный счётчик нерешённых — только среди **загруженной страницы** (по умолчанию до 20 строк), не глобальный. Запрос выполняется при открытии раздела.

Вкладка **«Лог операций»** в `/app/settings`: бейдж с **`openAutoMergeConflictCount`** — число **строк** `auto_merge_conflict` с `resolved_at IS NULL` (дедуп по `conflict_key` даёт одну открытую строку на конфликт; `repeat_count` на бейдж не влияет).

**Устойчивость UI и навигация (после hardening):**
- `merge-preview` в `AdminMergeAccountsPanel`: предыдущий запрос отменяется через `AbortController`; ответы от устаревших запросов не применяются (монотонный счётчик запроса), чтобы при быстрой смене второй записи или опций не показывался чужой preview. Пока раздел merge в аккордеоне карточки **не открыт** (`suspendHeavyFetch`), кандидаты / preview / поиск второй записи не запрашиваются, активные запросы отменяются.
- Поиск второй записи (`merge-user-search`): сеть/403 показываются отдельно от пустого списка; UUID второй стороны, выбранной только из поиска, дублируется отдельной опцией в `<select>` и строкой с полным UUID.
- Страница `/app/doctor/clients/name-match-hints`: ссылки на карточку ведут на `?scope=all&selected=<uuid>`; при новом запуске отчёта предыдущие строки очищаются до прихода ответа; «Назад» — в список **все подписчики** (`scope=all`).

Чистая логика ориентации preview и проверки `canSubmitManualMerge` вынесена в `apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts` (тесты рядом).

## Операционный контроль после деплоя

- Preflight: `apps/webapp/scripts/audit-platform-user-preflight.sql`
- Diagnostic audit: `apps/webapp/scripts/audit-platform-user-merge.sql`
- Минимальные проверки:
  - unresolved `platform_user_id IS NULL` в migrated tables;
  - duplicate canonical rows по strong IDs;
  - ссылки на merged aliases в таблицах, где ожидается перенос.
