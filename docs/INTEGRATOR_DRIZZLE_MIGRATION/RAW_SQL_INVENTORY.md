# Инвентаризация: сырой SQL вне Drizzle query builder

**Дата снимка:** 2026-05-15  
**Контекст:** миграция интегратора на Drizzle; в отчёте — весь монорепозиторий (не только `apps/integrator`), т.к. «сырой» `pg` и строковый SQL широко используется в webapp, worker и пакетах.

## Методология

| Категория | Включено в отчёт | Комментарий |
|-----------|------------------|-------------|
| **A. `pg` Pool / PoolClient** — `pool.query(...)`, `client.query(...)` | Да | Прямой текст SQL + параметры, без Drizzle relational API. |
| **B. `DbPort.query` (интегратор)** | Да | Обёртка над тем же `pg` (`createDbPort` в `apps/integrator/src/infra/db/client.ts`). |
| **C. `db.query` на пуле webapp** | Да | Там, где `db` — это `pg.Pool` (отдельное подключение к БД интегратора / не Drizzle webapp). |
| **D. Drizzle `db.query.*.findFirst` / `insert` / `select().from()`** | Нет | Уже «обёртка» Drizzle. |
| **E. Drizzle `execute(sql\`…\`)` и `runIntegratorSql(db, sql\`…\`)`** | Отдельный раздел | SQL остаётся текстом, но выполнение идёт через Drizzle-сессию (`getIntegratorDrizzleSession` / `runIntegratorSql`). |

**Не цель отчёта:** определения колонок `sql\`...\`` внутри `db/schema/*.ts` (DDL схемы Drizzle), HTTP-клиенты с `.query(true)` (nock).

**Тесты и скрипты:** перечислены; помечены как `script` / `test`, где уместно.

---

## Раздел E (справочно): SQL через Drizzle `execute` / `runIntegratorSql`

Здесь **нет** прямого `pool.query`, но остаётся **сырой SQL-текст** в шаблонах `sql`…`` — для миграции на «чистый» query builder это отдельный слой.

| Файл | Назначение |
|------|------------|
| `apps/integrator/src/infra/db/repos/projectionOutbox.ts` | Claim событий projection outbox (CTE + `FOR UPDATE SKIP LOCKED`). |
| `apps/integrator/src/infra/db/repos/jobQueue.ts` | Claim отложенных jobs очереди сообщений. |
| `apps/integrator/src/infra/db/repos/reminders.ts` | Сложные операции напоминаний (в т.ч. `execute(sql)`). |
| `apps/integrator/src/infra/db/repos/bookingCalendarMap.ts` | Синхронизация полей `public.patient_bookings` с картой календаря (`runIntegratorSql`). |
| `apps/integrator/src/infra/db/repos/channelUsers.ts` | Пользователи каналов / привязки Telegram и связанные выборки/апдейты (`runIntegratorSql`). |
| `apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts` | Слияние пользователей интегратора (identities, telegram_state, projection outbox и др., `runIntegratorSql`). |
| `apps/integrator/src/infra/db/repos/messageThreads.ts` | Треды поддержки / черновики / списки разговоров (`runIntegratorSql`). |
| `apps/webapp/src/infra/repos/warmupFeelingTrackingTx.ts` | Прогрев/проверка транзакции Drizzle (`tx.execute(sql)`). |
| `apps/webapp/src/app-layer/db/drizzle.smoke.test.ts` | Smoke `select 1` для Drizzle. |

---

## 1. `apps/integrator`

### 1.1 Инфраструктура БД

| Файл | Назначение запросов |
|------|---------------------|
| `src/infra/db/client.ts` | Реализация `DbPort.query` / транзакция `BEGIN`/`COMMIT`/`ROLLBACK` на `pg` client; health `SELECT 1` на пуле. |
| `src/infra/db/migrate.ts` | Применение SQL-миграций: `CREATE SCHEMA`, проверки таблицы миграций, `BEGIN`/`COMMIT`/`ROLLBACK`, выполнение тела миграции, запись в ledger. |

### 1.2 Репозитории и чтение (сырой `db.query` / `tx.query`)

| Файл | Назначение |
|------|------------|
| `src/infra/db/repos/outgoingDeliveryQueue.ts` | Очередь `public.outgoing_delivery_queue`: idempotent insert, сброс зависших `processing`, claim с `SKIP LOCKED`, финальные статусы и reschedule. |
| `src/infra/db/repos/projectionHealth.ts` | Агрегаты по `projection_outbox` (counts по статусам, oldest pending, распределение ретраев, last success, over threshold). |
| `src/infra/db/repos/messengerPhoneBindAudit.ts` | В транзакции: upsert/инкремент аудита привязки телефона мессенджера (`tx.query`). |
| `src/infra/db/repos/platformUserDeliveryPhone.ts` | Нормализованный телефон платформенного пользователя. |
| `src/infra/db/repos/patientHomeMorningPing.ts` | Данные для утреннего пинга (привязки, флаги, ключи настроек). |
| `src/infra/db/repos/idempotencyKeys.ts` | Проверка/учёт idempotency по динамически собранному SQL. |
| `src/infra/db/repos/adminStats.ts` | Админ-статистика (динамический query + агрегаты по Telegram / Rubitime). |
| `src/infra/db/repos/linkedPhoneSource.ts` | Чтение `system_settings` для источника привязки телефона. |
| `src/infra/db/repos/resolvePlatformUserIdForRubitimeBooking.ts` | Разрешение `platform_users.id` для записи Rubitime. |
| `src/infra/db/repos/canonicalUserId.ts` | Канонический user id / merge target. |
| `src/infra/db/repos/integrationDataQualityIncidents.ts` | Подсчёт инцидентов качества данных (SQL + параметры). |
| `src/integrations/rubitime/db/bookingProfilesRepo.ts` | Профили записей Rubitime: выборки, upsert/delete связей, работа с снапшотами и привязками к `platform_users` / записям. |

### 1.3 HTTP / runtime / конфиг

| Файл | Назначение |
|------|------------|
| `src/integrations/bersoncare/settingsSyncRoute.ts` | Подписанный webhook: upsert в `integrator.system_settings` сырой `INSERT … ON CONFLICT`. |
| `src/infra/db/adminIncidentAlertRelay.ts` | Чтение настроек для релея инцидентов. |
| `src/infra/db/branchTimezone.ts` | IANA timezone филиала. |
| `src/infra/runtime/worker/outgoingDeliveryWorker.ts` | Проверка статуса строки очереди перед обработкой. |
| `src/config/appBaseUrl.ts` | Кэшируемое чтение `app_base_url` из `system_settings`. |
| `src/config/appTimezone.ts` | Кэшируемое чтение таймзоны отображения. |
| `src/integrations/google-calendar/runtimeConfig.ts` | JSON настройки Google Calendar из `system_settings`. |
| `src/kernel/domain/executor/handlers/patientHomeMorningPing.ts` | Handler: чтение настроек (`value_json`) для сценария пинга. |

### 1.4 Блокировки и throttle

| Файл | Назначение |
|------|------------|
| `src/integrations/rubitime/rubitimeApiThrottle.ts` | `pg_advisory_lock` / unlock + выборка метаданных throttle. |
| `src/infra/db/repos/schedulerLocks.ts` | `pg_try_advisory_lock` / `pg_advisory_unlock` для слотов планировщика. |

### 1.5 Скрипты и операции

| Файл | Назначение |
|------|------------|
| `scripts/projection-health.mjs` | CLI: те же агрегаты outbox, что и `projectionHealth.ts`, для релизных проверок. |
| `src/infra/scripts/stage6-historical-time-backfill.ts` | Массовый бэкфилл времени: `BEGIN`/`COMMIT`, пары webapp/integrator клиентов, `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` на ошибках строки. |
| `src/infra/scripts/resync-rubitime-records.ts` | Ресинк записей Rubitime: динамический `UPDATE rubitime_records SET …`, выборки outbox. |
| `src/infra/scripts/compare-rubitime-records.ts` | Сравнение локальных строк с внешним снимком (`input.db.query` с параметризованным SQL). |

---

## 2. `apps/webapp`

### 2.1 Ядро и общие утилиты

| Файл | Назначение |
|------|------------|
| `src/infra/db/client.ts` | Healthcheck: `select 1` на выделенном клиенте пула. |
| `src/infra/adminAuditLog.ts` | Журнал админ-действий: вставка, списки/фильтры, транзакции при дедупликации. |
| `src/infra/userLifecycleLock.ts` | Транзакционные `pg_advisory_xact_lock` / shared lock по user id (сериализация жизненного цикла). |
| `src/infra/multipartSessionLock.ts` | Advisory lock по id multipart-сессии. |
| `src/modules/system-settings/configAdapter.ts` | Dual-read настроек: `SELECT value_json FROM system_settings` (admin scope) с TTL-кэшем. |
| `src/infra/integrator-push/integratorPushOutbox.ts` | Запись и обновление статусов `integrator_push_outbox` на пуле webapp (сырой SQL). |
| `src/infra/idempotency/pgStore.ts` | Хранилище идемпотентности API (insert/select). |

### 2.2 Аутентификация и лимиты

| Файл | Назначение |
|------|------------|
| `src/modules/auth/channelLink.ts` | Секреты channel link: выборки, удаления, пометка `used_at`, транзакции claim. |
| `src/modules/auth/channelLinkClaim.ts` | Классификация «владельца» привязки: множество `SELECT count` по таблицам данных + обновление секретов в транзакции. |
| `src/modules/auth/service.ts` | Сырой SQL в потоке аутентификации (см. файл). |
| `src/modules/auth/channelLinkStartRateLimit.ts` | Rate limit старта channel link. |
| `src/modules/auth/oauthStartRateLimit.ts` | Rate limit старта OAuth. |
| `src/modules/auth/messengerStartRateLimit.ts` | Rate limit старта мессенджера. |
| `src/modules/auth/checkPhoneRateLimit.ts` | Rate limit проверки телефона. |
| `src/modules/auth/phoneOtpLimits.ts` | OTP: очистка просроченных блокировок, upsert лимитов. |
| `src/modules/auth/emailAuth.ts` | Email challenges: delete/update/insert по сценарию challenge. |

### 2.3 Интегратор (HTTP из webapp)

| Файл | Назначение |
|------|------------|
| `src/modules/integrator/messengerPhoneHttpBindExecute.ts` | Привязка телефона через HTTP к интегратору: `db.query` на **отдельном** пуле интегратора + `client.query` в транзакции слияния/аудита. |

### 2.4 Репозитории `pg*` и медиа

| Файл | Назначение |
|------|------------|
| `src/infra/repos/pgDoctorBroadcastDelivery.ts` | Рассылка врача: транзакция, insert попыток доставки. |
| `src/infra/repos/pgReminderProjection.ts` | Проекция напоминаний webapp ↔ integrator_user_id. |
| `src/infra/repos/pgReminderRules.ts` | Правила напоминаний + синхронизация с webapp-правилами в транзакции. |
| `src/infra/repos/pgReminderJournal.ts` | Журнал/события напоминаний, snooze, транзакции с несколькими апдейтами. |
| `src/infra/repos/pgSymptomDiary.ts` | Дневник симптомов: выборки, вставки, обновления, удаления, join-агрегаты. |
| `src/infra/repos/pgDoctorClients.ts` | Список клиентов врача, привязки, операции с `user_channel_bindings`. |
| `src/infra/repos/pgLfkExercises.ts` | Каталог упражнений ЛФК: динамические списки/фильтры (`sql` строки + `pool.query`), регионы, медиа, транзакции create/update/delete. |
| `src/infra/repos/pgLfkTemplates.ts` | Шаблоны комплексов ЛФК: тяжёлые list-запросы + транзакции правки упражнений шаблона. |
| `src/infra/repos/pgLfkDiary.ts` | Дневник ЛФК-сессий: CRUD, агрегаты по датам, удаление сессий. |
| `src/infra/repos/pgLfkAssignments.ts` | Назначения ЛФК пациенту в транзакции. |
| `src/infra/repos/pgPatientCalendarTimezone.ts` | Таймзона календаря пациента. |
| `src/infra/repos/pgMediaTranscodeJobs.ts` | Очередь/статусы транскодинга в транзакции claim/update. |
| `src/infra/repos/s3MediaStorage.ts` | Медиа-файлы: advisory lock по media id, delete/update статусов, транзакции с CMS-метаданными, поиск сиротских файлов. |
| `src/infra/repos/mediaFoldersRepo.ts` | Папки медиа: rename, проверки детей, delete. |
| `src/infra/repos/mediaUploadSessionsRepo.ts` | Сессии загрузки + очистка pending `media_files`. |
| `src/infra/repos/mediaPreviewWorker.ts` | Превью воркер: длинная транзакция обновления статусов превью и связанных таблиц. |
| `src/infra/repos/pgBroadcastAudit.ts` | Аудит рассылок. |
| `src/infra/repos/pgSupportCommunication.ts` | Поддержка: диалоги, сообщения, служебные проверки `SELECT 1`, статусы. |
| `src/infra/repos/pgReferences.ts` | Справочники reference data: выборки, транзакции reorder, soft-delete. |
| `src/infra/repos/pgAppointmentProjection.ts` | Проекция записей на приём (транзакция с несколькими шагами). |
| `src/infra/repos/pgPatientBookings.ts` | Записи пациента: вставки/обновления проекции из внешних источников. |
| `src/infra/repos/pgUserProjection.ts` | Связка webapp user ↔ integrator / platform_users: выборки, insert, merge-апдейты, транзакции. |
| `src/infra/repos/pgIdentityResolution.ts` | Разрешение идентичностей по телефону/привязкам. |
| `src/infra/repos/pgUserByPhone.ts` | Поиск пользователя по телефону и привязкам. |
| `src/infra/repos/pgMessageLog.ts` | Логи сообщений (агрегаты/списки). |
| `src/infra/repos/pgChannelPreferences.ts` | Настройки каналов уведомлений. |
| `src/infra/repos/pgDoctorAppointments.ts` | Записи врача (несколько вариантов SQL по режиму). |
| `src/infra/repos/pgBookingCatalog.ts` | Каталог филиалов/услуг бронирования: тяжёлые выборки и модификации. |
| `src/infra/repos/pgPhoneChallengeStore.ts` | Хранилище phone challenges (insert/select/delete). |
| `src/infra/repos/pgUserPins.ts` | Закрепления пользователя. |
| `src/infra/repos/pgLoginTokens.ts` | Токены логина. |
| `src/infra/repos/pgSubscriptionMailingProjection.ts` | Проекция подписок/рассылок. |
| `src/infra/repos/pgOnlineIntake.ts` | Online intake: shared advisory lock по user id + операции заявки. |
| `src/infra/repos/pgDiaryPurge.ts` | Purge данных дневника (advisory + delete). |
| `src/infra/repos/pgSystemSettings.ts` | Системные настройки (транзакционные обновления при определённых сценариях). |
| `src/infra/repos/pgClinicalTests.ts` | Клинические тесты: Drizzle для основной модели + **сырой** `pool.query` для usage summary. |
| `src/infra/repos/pgTestSets.ts` | Наборы тестов / связка с клиническими тестами (агрегирующий `pool.query`). |
| `src/infra/repos/pgRecommendations.ts` | Рекомендации: выборка с агрегацией через `pool.query`. |
| `src/infra/platformUserFullPurge.ts` | Полное удаление данных пользователя (каскады DELETE/UPDATE по множеству таблиц). |
| `src/infra/strictPlatformUserPurge.ts` | Строгий purge: delete медиа, advisory lock. |

### 2.5 App routes / server actions

| Файл | Назначение |
|------|------------|
| `src/app/app/doctor/content/motivation/actions.ts` | CMS мотивационных цитат: insert/list, архивация, reorder в транзакции, `pool.query`. |
| `src/app/api/internal/media-multipart/cleanup/route.ts` | Удаление pending `media_files` при очистке multipart. |
| `src/app/api/media/multipart/init/route.ts` | При ошибке инициализации multipart — `DELETE` pending `media_files` через `getPool().query`. |
| `src/app/api/doctor/clients/integrator-merge/route.ts` | Слияние клиентов: `client.query` в транзакции (интеграция с merge-пакетом). |

### 2.6 App-layer (health / media)

| Файл | Назначение |
|------|------------|
| `src/app-layer/health/collectAdminSystemHealthData.ts` | Админ health: агрегаты по превью медиа и зависшим pending. |
| `src/app-layer/media/adminTranscodeHealthMetrics.ts` | Метрики здоровья транскодинга. |
| `src/app-layer/media/videoHlsLegacyBackfill.ts` | Legacy HLS backfill: выборки/агрегаты по `media_files`. |

### 2.7 Скрипты `apps/webapp/scripts`

| Файл | Назначение |
|------|------------|
| `run-migrations.mjs` | Кастомный раннер SQL-миграций webapp. |
| `seed-drizzle-migrations-meta.mjs` | Создание `drizzle.__drizzle_migrations` и мета-строк. |
| `reconcile-person-domain.mjs` | Сверка/чинение person-domain данных (несколько SELECT). |
| `seed-content-pages.mjs` | Сид контент-страниц в транзакции. |
| `verify-drizzle-public-table-count.mjs` | Верификация счётчиков строк public-таблиц. |
| `user-phone-admin.ts` | Админ CLI по телефону/purge/merge: массовый сырой SQL + `integratorDb.query`. |
| `realign-webapp-integrator-user-projection.ts` | Реалайн проекции пользователей. |
| `seed-booking-catalog-tochka-zdorovya.ts` | Сид каталога бронирования. |
| `backfill-rubitime-history-to-patient-bookings.ts` | Бэкфилл истории Rubitime → `patient_bookings`. |
| `backfill-rubitime-compat-snapshots.ts` | Совместимые снапшоты Rubitime. |
| `requeue-projection-outbox-dead.ts` | Переочередь dead-событий projection outbox. |
| `backfill-patient-bookings-v2.ts` | Бэкфилл patient_bookings v2. |

### 2.8 Тесты

| Файл | Назначение |
|------|------------|
| `src/infra/repos/pgPlatformUserMerge.devDb.integration.test.ts` | Интеграционная очистка тестовых данных через `client.query`. |

---

## 3. `apps/media-worker`

| Файл | Назначение |
|------|------------|
| `src/processTranscodeJob.ts` | Статусы медиа и джобов: несколько `pool.query` / `ctx.pool.query` (обновление прогресса, финализация, ошибки). |
| `src/jobs/claim.ts` | Claim транскодинг-джоба в транзакции (`FOR UPDATE SKIP LOCKED` + update). |

---

## 4. Пакеты `packages/`

| Файл | Назначение |
|------|------------|
| `platform-merge/src/pgPlatformUserMerge.ts` | Крупная процедура слияния платформенных пользователей: блокировки, перенос строк по десяткам таблиц, очистка дубликатов. |
| `platform-merge/src/messengerPhonePublicBind.ts` | Публичная привязка телефона мессенджера: realign/update через `db.query` (pg). |
| `booking-rubitime-sync/src/upsertPatientBookingFromRubitime.ts` | Upsert/delete `public.patient_bookings` при синке из Rubitime. |

---

## 5. Как читать этот отчёт дальше

1. **Интегратор:** приоритет миграции — файлы с **частым** изменением схемы (`bookingProfilesRepo`, `outgoingDeliveryQueue`, конфиг-чтения) и **операционные скрипты**. `migrate.ts` и `client.ts` останутся точкой выполнения SQL даже при полном Drizzle на домене.  
2. **Webapp:** основная масса — `src/infra/repos/pg*.ts` и auth; Drizzle уже покрывает часть доменов, но параллельно живёт `pg` для legacy-сложных запросов.  
3. **Точечный поиск в репозитории:** `rg "pool\\.query\\(|client\\.query\\(" apps packages` и для интегратора `rg "await db\\.query\\(" apps/integrator` (имя `db` там — пул `pg`).

*Примечание:* при добавлении файлов этот документ стоит обновлять или регенерировать по тем же запросам `rg`, чтобы не расходиться с кодом.
