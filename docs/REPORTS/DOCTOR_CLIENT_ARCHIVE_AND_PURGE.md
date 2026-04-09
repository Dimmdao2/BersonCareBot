# Архив и безвозвратное удаление клиента (кабинет врача)

Отчёт по реализованной логике жизненного цикла учётной записи клиента: архив → безвозвратное удаление, точки в коде и ограничения доступа.

**Дата документа:** 2026-04-08  
**Подробный лог доработок:** [DOCTOR_CLIENT_ARCHIVE_AND_PURGE_LOG.md](./DOCTOR_CLIENT_ARCHIVE_AND_PURGE_LOG.md)

---

## 1. Сделанная работа (сводка)

- **Архив / снятие архива:** доступны пользователям с ролью врача или администратора (`canAccessDoctor`), флаг в БД `platform_users.is_archived`.
- **Безвозвратное удаление:** только для клиентов с `role = client`, только если клиент **уже в архиве**, с телом запроса `confirmUserId` (совпадение с UUID в URL) и многошаговым подтверждением в UI.
- **Ограничение «admin mode»:** безвозвратное удаление через API кабинета врача разрешено **только** при `session.user.role === "admin"` **и** включённом `session.adminMode` (как у прочих admin API: каталог записи, Rubitime и т.д.). Обычный врач (`doctor`) purge выполнить не может; в UI кнопка удаления скрыта, показаны пояснения.
- **Для чистого ретеста нового пользователя:** одного архива недостаточно; нужен `permanent-delete` (или CLI `purge-by-id`) и успешная очистка integrator, иначе в боте может остаться `linkedPhone` и `/start` не покажет повторный onboarding.

Безвозвратное удаление выполняется через **`runStrictPurgePlatformUser`** (`apps/webapp/src/infra/strictPlatformUserPurge.ts`): advisory lock → preflight ключей S3 в одной транзакции с DELETE → post-commit параллельно S3 + integrator → запись в `admin_audit_log`. Обёртка **`purgePlatformUserByPlatformId`** (`platformUserFullPurge.ts`) делегирует в strict purge. CLI `purge-by-id` вызывает strict purge напрямую.

---

## 2. Поток «архив → удаление»

| Шаг | Описание |
|-----|----------|
| 1 | Врач/админ переводит клиента в архив: `PATCH .../archive` с `{ archived: true }`. |
| 2 | Администратор включает **режим администратора** (Настройки → переключатель admin mode). |
| 3 | На карточке заархивированного клиента доступна кнопка «Удалить безвозвратно» (только при admin + adminMode). |
| 4 | UI: `confirm` → `prompt` с вводом полного UUID → `POST .../permanent-delete` с `{ confirmUserId }`. |
| 5 | Сервер проверяет admin mode, UUID, роль client, `isArchived`, затем вызывает `runStrictPurgePlatformUser` (аудит `user_purge`, актор — admin). |

---

## 3. Точки реализации в коде

### 3.1 API

| Файл | Назначение |
|------|------------|
| `apps/webapp/src/modules/doctor-clients/clientArchiveChange.ts` | Общая логика архива: `applyClientArchiveChange`, схема тела `clientArchiveBodySchema`; внутри — `createPgDoctorClientsPort()` + `getPool` (без `buildAppDeps`). |
| `apps/webapp/src/app/api/doctor/clients/[userId]/archive/route.ts` | `PATCH` — guard: сессия (иначе **401**) + `canAccessDoctor` (иначе **403**), затем `applyClientArchiveChange`. |
| `apps/webapp/src/app/api/admin/users/[userId]/archive/route.ts` | `PATCH` — тот же `applyClientArchiveChange`, guard: `role === admin` (нет сессии или не admin → **403**). Цель не `client` → **404** `not_client`, как у doctor. |
| `apps/webapp/src/app/api/doctor/clients/[userId]/permanent-delete/route.ts` | `POST` — безвозвратное удаление. Guard: **`requireAdminModeSession()`** (admin + adminMode), затем проверки тела, роли, архива, вызов **`runStrictPurgePlatformUser`**. Ответ включает `outcome`, `details` (S3/integrator). |
| `apps/webapp/src/modules/auth/requireAdminMode.ts` | `requireAdminModeSession`: нет сессии → **401** `unauthorized`; не admin или `adminMode` выкл. → **403** `forbidden`. |

### 3.2 Данные врача (порт)

| Файл | Назначение |
|------|------------|
| `apps/webapp/src/modules/doctor-clients/ports.ts` | Контракт: `setUserArchived`, `getClientIdentity` (в т.ч. `isArchived`; комментарий к полю описывает архив и снятие через тот же PATCH). |
| `apps/webapp/src/infra/repos/pgDoctorClients.ts` | Реализация PG: `UPDATE platform_users SET is_archived = ...`, списки с фильтром `archivedOnly`. |

### 3.3 UI

| Файл | Назначение |
|------|------------|
| `apps/webapp/src/app/app/doctor/clients/page.tsx` | Список клиентов: в URL **`scope=archived`** → на сервер уходит **`listClients({ archivedOnly: true })`** (раздел «Архив»). Режимы `scope=appointments` / `scope=all` задают другие фильтры списка. |
| `apps/webapp/src/app/app/doctor/clients/DoctorClientsPanel.tsx` | Отображение списка и **дополнительные** клиентские фильтры (поиск `q`, telegram / max / appointment) поверх уже загруженных данных; это не второй фильтр архива. |
| `apps/webapp/src/app/app/doctor/clients/[userId]/page.tsx` | Страница профиля; передаёт в карточку `canPermanentDelete={role === 'admin' && Boolean(adminMode)}`. |
| `apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx` | Пробрасывает `isAdmin`, `canPermanentDelete` в блок жизненного цикла. |
| `apps/webapp/src/app/app/doctor/clients/DoctorClientLifecycleActions.tsx` | Кнопки «В архив» / «Вернуть из архива» / «Удалить безвозвратно»; последняя только при `canPermanentDelete`; подсказки для врача и для admin без admin mode. |

### 3.4 Ядро удаления (webapp + integrator)

| Файл | Назначение |
|------|------------|
| `apps/webapp/src/infra/platformUserFullPurge.ts` | Ядро DELETE в webapp (`runWebappPurgeCoreInTransaction`), сбор ключей `collectPurgeArtifactKeys`, integrator helper’ы. `purgePlatformUserByPlatformId` → strict purge. |
| `apps/webapp/src/infra/strictPlatformUserPurge.ts` | `runStrictPurgePlatformUser`: `pg_advisory_xact_lock(hashtext(userId))`, preflight ключей из `online_intake_attachments` + `media_files`, post-commit S3 + integrator параллельно, аудит. |
| `apps/webapp/src/infra/userLifecycleLock.ts` | `withUserLifecycleLock` / `withTwoUserLifecycleLocksExclusive` — shared (presign, LFK и nutrition intake) и exclusive (purge, manual merge) на `hashtext(userId)`. |
| `apps/webapp/scripts/user-phone-admin.ts` | CLI `purge-by-id <uuid>` — `runStrictPurgePlatformUser`; при `outcome !== completed` выводит JSON `details` и код выхода 1. |

### 3.5 Тесты

| Файл | Назначение |
|------|------------|
| `apps/webapp/src/app/api/doctor/clients/[userId]/archive/route.test.ts` | Тесты doctor archive API (мок `pgDoctorClients` / `getPool`). |
| `apps/webapp/src/app/api/admin/users/[userId]/archive/route.test.ts` | Тесты admin archive (доступ только admin). |
| `apps/webapp/src/app/api/doctor/clients/[userId]/permanent-delete/route.test.ts` | Тесты permanent-delete, в т.ч. отказ при отсутствии admin mode (мок `requireAdminModeSession`). |
| `apps/webapp/src/infra/strictPlatformUserPurge.test.ts` | Порядок tx/lock/collect, post-commit S3+integrator, audit при rollback. |
| `apps/webapp/src/infra/manualPlatformUserMerge.test.ts` | Dual lock + `user_merge` audit (ok / error после rollback). |

---

## 4. Логика strict purge (кратко)

1. **Валидация:** UUID, пользователь существует, `role === 'client'`.
2. **Транзакция webapp (одна сессия):**
   - `pg_advisory_xact_lock(hashtext(platform_user_id::text))` — exclusive; блокирует конкурирующий strict purge/merge и shared-lock upload до commit.
   - **Preflight:** `SELECT` ключей S3 из `online_intake_attachments` (по заявкам пользователя) и из `media_files` (`uploaded_by = user`) **до** каскадных DELETE заявок/пользователя.
   - Если задан **нормализованный телефон** — дополнительно удаляются строки, привязанные к номеру (`phone_otp_locks`, `phone_challenges`, `appointment_records`, часть `message_log` по совпадению номера у пользователей с тем же номером).
   - Если **телефона нет** — этот шаг пропускается; удаление идёт по **UUID** (`platform_users.id`) и связанным таблицам.
   - `clearPlatformUserDeleteBlockers` — снятие FK-блокировок (`blocked_by`, назначения ЛФК, онлайн-заявки, `system_settings.updated_by`, ноты и т.д.).
   - `deleteSymptomAndLfkDiaryForUser` — дневники симптомов и ЛФК (порядок с учётом FK).
   - `deleteContentTablesForUser` — перечень `CONTENT_TABLES` (брони, напоминания, ноты, поддержка, гранты контента, топики уведомлений, предпочтения каналов, просмотры новостей, онлайн-intake и др.).
   - При наличии **`integrator_user_id`** в webapp — дополнительная чистка проекций по bigint в webapp (`deleteWebappProjectionByIntegratorUserId`).
   - `DELETE FROM message_log WHERE user_id = ...` (поле текстовое, UUID строкой).
   - Таблицы из `IDENTITY_TABLES` (привязки каналов, PIN, login tokens, OAuth).
   - `DELETE FROM platform_users WHERE id = ...`.
3. **После COMMIT webapp — внешняя очистка (не одна транзакция с webapp):**
   - Параллельно и **независимо**: удаление объектов S3 по собранным ключам (per-key ошибки агрегируются) и `deleteIntegratorPhoneData` в integrator (отдельная транзакция в БД integrator). Оба шага выполняются без short-circuit при ошибке в другом.
   - Для `media_files`: строки с `s3_key IS NULL` удаляются как DB-only артефакты; для строк с `s3_key` после успешного удаления объекта в S3 выполняется `DELETE FROM media_files` по id (если S3 отключён в окружении — только удаление строк БД).
4. **Аудит:** `writeAuditLog` в **отдельной** транзакции после основной: `ok` / `partial_failure` / `error`; при rollback webapp — запись об ошибке, сам аудит не откатывается вместе с purge.
5. **Итог API:** `outcome`: `completed` | `partial_failed` | `needs_retry` (интегратор не очистился при наличии пула, без ошибок S3); `integratorSkipped: true`, если пул integrator не настроен.

**Важно:** атомарность гарантируется **в пределах БД webapp**; связка webapp + integrator + S3 — **разные** границы коммита; частичный сбой отражается в `admin_audit_log` и в `details` ответа.

**Клиент без телефона:** в webapp purge полный по UUID; в integrator удаление строки `users` по id срабатывает, если в webapp заполнен **`integrator_user_id`**. Если нет ни телефона, ни `integrator_user_id`, автоматическое сопоставление с integrator по телефону не работает — возможны хвосты в БД integrator (операционно — отдельные скрипты/cleanup).

### 4.1 Полнота удаления: что покрыто, что нет

- **Явно удаляется в webapp:** `phone_otp_locks`, `phone_challenges`, `appointment_records`, `message_log`, `patient_bookings`, `reminder_rules`, `doctor_notes`, `support_conversations`, `patient_lfk_assignments`, `content_access_grants_webapp`, `user_notification_topics`, `user_channel_preferences`, `news_item_views`, `online_intake_requests`, `user_channel_bindings`, `user_pins`, `login_tokens`, `user_oauth_bindings`, а также дневники симптомов и ЛФК.
- **Дополнительно закрывается по `integrator_user_id`:** webapp-проекции без прямой UUID-связи (`reminder_delivery_events`, `reminder_occurrence_history`, `user_subscriptions_webapp`, `mailing_logs_webapp`, `support_questions`, `support_question_messages` и др.).
- **Удаляется каскадно через FK `ON DELETE CASCADE`:** `channel_link_secrets`, `auth_methods`, `email_verifications`, `email_otp_challenges`, `lfk_sessions` и другие таблицы, где удаление завязано на `platform_users(id)`.
- **Медиа и S3:** strict purge собирает артефакты до DELETE: `online_intake_attachments.s3_key` и `media_files` по `uploaded_by` (включая строки без `s3_key` для DB-only cleanup). После commit удаляются объекты в private bucket и затем строки `media_files` при успешном S3 delete; строки без `s3_key` удаляются напрямую. Если в процессе purge S3 «выключен» в конфиге webapp (`isS3MediaEnabled`), в `details`/`audit` выставляется **`intakeS3ObjectsNotDeletedBucketDisabled`** при наличии S3-ключей — объекты в bucket могли не удалиться (операционный сигнал). Для повтора внешнего хвоста audit хранит `artifact`, `phoneNormalized`, `webappIntegratorUserId`, `resolvedIntegratorUserIds`; `retryStrictPurgeExternalCleanup` использует этот payload без повторного удаления `platform_users`.
- **Критичный операционный риск:** если webapp запущен без корректного `INTEGRATOR_DATABASE_URL` для integrator БД, ответ содержит `integratorSkipped: true` и bot-side данные останутся. Для ретеста `/start` это означает, что Telegram может продолжить считать номер привязанным.

---

## 5. Окружение webapp и `DATABASE_URL` (связано с деплоем)

Фича архива не задаёт отдельных переменных; работа идёт через общий доступ к PostgreSQL.

| Механизм | Файл | Смысл |
|----------|------|--------|
| `webappReposAreInMemory()` | `apps/webapp/src/config/env.ts` | При пустом `DATABASE_URL`: Vitest → in-memory; `next dev` → **throw**; `next build` (часто `NODE_ENV=production` без БД в CI) → in-memory, чтобы сборка прошла. |
| `register()` | `apps/webapp/src/instrumentation.ts` | Production, пустой `DATABASE_URL`, `npm_lifecycle_event === "start"` (`next start`) → **throw** до запросов. |
| `getPool()` | `apps/webapp/src/infra/db/client.ts` | Любой вызов без URL → ошибка (в т.ч. standalone без npm lifecycle). |
| Сборка DI | `apps/webapp/src/app-layer/di/buildAppDeps.ts` | Ветвление PG / in-memory через `inMemoryRepos = webappReposAreInMemory()` после всех импортов. |

Подробности и история правок: [DOCTOR_CLIENT_ARCHIVE_AND_PURGE_LOG.md](./DOCTOR_CLIENT_ARCHIVE_AND_PURGE_LOG.md).

---

## 6. Согласованность с другими сценариями purge

- Пациентское удаление **только дневника** (не `platform_users`): `apps/webapp/src/infra/repos/pgDiaryPurge.ts`, API patient diary purge — другой контракт.
- Админские опасные действия на карточке (если есть): `AdminDangerActions` — отдельный блок, не смешивать с doctor client lifecycle без явной необходимости.

## 6.1 Как пересоздать пользователя для теста onboarding

1. Перевести клиента в архив (`PATCH .../archive` или UI «В архив»).
2. Выполнить `POST .../permanent-delete` из UI архива под `admin + adminMode`, либо CLI `purge-by-id <uuid>`.
3. Убедиться, что `outcome === 'completed'` и при необходимости `integratorSkipped: false`; иначе смотреть `details` / аудит и повторить внешний хвост или `integrator-clear-phone` / `integrator-purge-user-id`.
4. Strict purge уже таргетит S3 + `media_files` при включённом S3 в окружении; при `partial_failed` проверить лог и повторить cleanup.
5. После этого тот же телефон можно регистрировать заново; `platform_users.id` и `integrator users.id` будут созданы заново.

---

## 7. История изменений

1. **Базовая реализация:** API archive / permanent-delete, UI жизненного цикла, `platformUserFullPurge`; purge из кабинета врача только при **admin + adminMode** (`requireAdminModeSession`, тест 403 без admin mode).
2. **2026-04-08 — архив API и документация:** общий `clientArchiveChange.ts` (doctor + admin), порт через `createPgDoctorClientsPort` без `buildAppDeps`; админский PATCH для не-клиента — **404** `not_client`; комментарий к `isArchived` в `ports.ts`; в отчёте — список клиентов (`scope=archived` → `archivedOnly`) и раздел §5 про env.
3. **2026-04-08 — webapp и БД:** `webappReposAreInMemory()`, `instrumentation.ts`, правки `buildAppDeps` / OAuth / online intake / phone OTP; детали в [DOCTOR_CLIENT_ARCHIVE_AND_PURGE_LOG.md](./DOCTOR_CLIENT_ARCHIVE_AND_PURGE_LOG.md).
4. **2026-04-09 — аудит полноты purge:** зафиксировано, какие таблицы чистятся вручную, какие закрываются `ON DELETE CASCADE`; ранний риск с `media_files.uploaded_by = NULL` затем закрыт strict-purge cleanup'ом из этапа 2; для чистого ретеста onboarding нужен purge с успешной integrator cleanup.
5. **2026-04-09 — strict purge (этап 2 плана):** advisory lock, preflight S3 в транзакции, post-commit S3 + integrator параллельно, `admin_audit_log` для `user_purge`, shared-lock для `POST /api/media/presign` и online-intake (`createLfkRequest` / **`createNutritionRequest`**). См. [STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md](./STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md).
6. **2026-04-09 — этап 6 (документация / верификация v1):** синхронизация описания lock protocol и manual merge (`withTwoUserLifecycleLocksExclusive`); отчёт о покрытии и ограничениях — в execution log.
