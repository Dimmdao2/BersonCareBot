# Инвентаризация: сырой SQL вне Drizzle query builder

**Дата снимка:** 2026-05-15  
**Контекст:** миграция интегратора на Drizzle; в отчёте — весь монорепозиторий (не только `apps/integrator`), т.к. «сырой» `pg` и строковый SQL широко используется в webapp, worker и пакетах.

**План перехода (фазы, риски, приоритеты):** [DRIZZLE_TRANSITION_PLAN.md](./DRIZZLE_TRANSITION_PLAN.md)

## Легенда столбцов оценки

| Столбец | Смысл |
|---------|--------|
| **Сложн.** | **Н** — простой маппинг на Drizzle API; **С** — транзакции, динамика, несколько таблиц; **В** — очереди/merge/purge, крупные CTE, `SKIP LOCKED`, cross-schema. |
| **Вариант** | Целевой подход: `Drizzle` — builder; `+sql` — фрагменты `sql`…``; `execute(sql)` — оставить явный SQL через Drizzle-сессию; `pg` — целесообразно оставить на `pg` (мигратор, ops). |
| **Риски** | Кратко: что ломается при ошибке миграции. |

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

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `apps/integrator/src/infra/db/repos/projectionOutbox.ts` | Claim событий projection outbox (CTE + `FOR UPDATE SKIP LOCKED`). | В | `execute(sql)` сохранить; опционально вынести в SQL-view + простой select | Регресс claim, дедлоки, порядок строк |
| `apps/integrator/src/infra/db/repos/jobQueue.ts` | Claim отложенных jobs очереди сообщений. | В | как выше | Идемпотентность, конкуренция воркеров |
| `apps/integrator/src/infra/db/repos/reminders.ts` | Сложные операции напоминаний (в т.ч. `execute(sql)`). | В | частично `Drizzle`, hot-path `execute(sql)` | Доменные правила напоминаний, TZ |
| `apps/integrator/src/infra/db/repos/bookingCalendarMap.ts` | Синхронизация полей `public.patient_bookings` с картой календаря (`runIntegratorSql`). | С | `Drizzle` + `runIntegratorSql`/`+sql` для public sync | Расхождение схем public vs integrator |
| `apps/integrator/src/infra/db/repos/channelUsers.ts` | Пользователи каналов / привязки Telegram и связанные выборки/апдейты (`runIntegratorSql`). | В | поэтапно `Drizzle`, сложные запросы `+sql` | Объём, дубли таблиц в схемах |
| `apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts` | Слияние пользователей интегратора (identities, telegram_state, projection outbox и др., `runIntegratorSql`). | В | оставить `runIntegratorSql` ядро; оболочки — `Drizzle` | Катастрофический регресс данных |
| `apps/integrator/src/infra/db/repos/messageThreads.ts` | Треды поддержки / черновики / списки разговоров (`runIntegratorSql`). | В | поэтапно `Drizzle` + `+sql` | UX поддержки, пагинация |
| `apps/webapp/src/infra/repos/warmupFeelingTrackingTx.ts` | Прогрев/проверка транзакции Drizzle (`tx.execute(sql)`). | Н | без изменений / `execute(sql)` | Низкий |
| `apps/webapp/src/app-layer/db/drizzle.smoke.test.ts` | Smoke `select 1` для Drizzle. | Н | `pg` / как есть | Низкий |

---

## 1. `apps/integrator`

### 1.1 Инфраструктура БД

| Файл | Назначение запросов | Сложн. | Вариант | Риски |
|------|---------------------|--------|---------|-------|
| `src/infra/db/client.ts` | Реализация `DbPort.query` / транзакция `BEGIN`/`COMMIT`/`ROLLBACK` на `pg` client; health `SELECT 1` на пуле. | Н | `DbPort` оставить как транспорт; health — опционально `execute(sql)` | Низкие; не трогать TX-оболочку без нужды |
| `src/infra/db/migrate.ts` | Применение SQL-миграций: `CREATE SCHEMA`, проверки таблицы миграций, `BEGIN`/`COMMIT`/`ROLLBACK`, выполнение тела миграции, запись в ledger. | Н | **`pg`** — не переносить на ORM | Низкие; мигратор должен оставаться прозрачным |

### 1.2 Репозитории и чтение (сырой `db.query` / `tx.query`)

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `src/infra/db/repos/outgoingDeliveryQueue.ts` | Очередь `public.outgoing_delivery_queue`: idempotent insert, сброс зависших `processing`, claim с `SKIP LOCKED`, финальные статусы и reschedule. | В | `Drizzle` для insert/update; claim — `execute(sql)` или аккуратный перенос | Очередь исходящей доставки |
| `src/infra/db/repos/projectionHealth.ts` | Агрегаты по `projection_outbox` (counts по статусам, oldest pending, распределение ретраев, last success, over threshold). | Н | `Drizzle` `select` + `groupBy` / `sql` агрегаты | Расхождение с CLI-скриптом, если не синхронизировать |
| `src/infra/db/repos/messengerPhoneBindAudit.ts` | В транзакции: upsert/инкремент аудита привязки телефона мессенджера (`tx.query`). | С | `getIntegratorDrizzleSession(tx)` + `insert`/`onConflict` | Дубликаты аудита, гонки |
| `src/infra/db/repos/platformUserDeliveryPhone.ts` | Нормализованный телефон платформенного пользователя. | Н | `Drizzle` | Низкие |
| `src/infra/db/repos/patientHomeMorningPing.ts` | Данные для утреннего пинга (привязки, флаги, ключи настроек). | С | `Drizzle` + при необходимости `+sql` | Неверный выбор получателей пинга |
| `src/infra/db/repos/idempotencyKeys.ts` | Проверка/учёт idempotency по динамически собранному SQL. | С | `Drizzle` + строгий whitelist динамики | SQL-инъекция при ошибочном whitelist |
| `src/infra/db/repos/adminStats.ts` | Админ-статистика (динамический query + агрегаты по Telegram / Rubitime). | С | `Drizzle` + `+sql` / материализованные представления (отдельная задача) | Неточные цифры в админке |
| `src/infra/db/repos/linkedPhoneSource.ts` | Чтение `system_settings` для источника привязки телефона. | Н | `Drizzle` | Низкие |
| `src/infra/db/repos/resolvePlatformUserIdForRubitimeBooking.ts` | Разрешение `platform_users.id` для записи Rubitime. | Н | `Drizzle` | Неверная привязка записи |
| `src/infra/db/repos/canonicalUserId.ts` | Канонический user id / merge target. | Н | `Drizzle` | Неверный merge target |
| `src/infra/db/repos/integrationDataQualityIncidents.ts` | Подсчёт инцидентов качества данных (SQL + параметры). | С | `Drizzle` + `+sql` | Алерты качества |
| `src/integrations/rubitime/db/bookingProfilesRepo.ts` | Профили записей Rubitime: выборки, upsert/delete связей, работа с снапшотами и привязками к `platform_users` / записям. | В | поэтапно `Drizzle`; сложное — `+sql` | Rubitime домен, дубли каталогов таблиц |

### 1.3 HTTP / runtime / конфиг

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `src/integrations/bersoncare/settingsSyncRoute.ts` | Подписанный webhook: upsert в `integrator.system_settings` сырой `INSERT … ON CONFLICT`. | С | `Drizzle` `insert` `onConflictDoUpdate` | Зеркало webapp↔integrator (`updateSetting`) |
| `src/infra/db/adminIncidentAlertRelay.ts` | Чтение настроек для релея инцидентов. | Н | `Drizzle` | Пропуск/ложные алерты |
| `src/infra/db/branchTimezone.ts` | IANA timezone филиала. | Н | `Drizzle` | Неверное время в отчётах |
| `src/infra/runtime/worker/outgoingDeliveryWorker.ts` | Проверка статуса строки очереди перед обработкой. | Н | `Drizzle` | Лишняя/недостаточная доставка |
| `src/config/appBaseUrl.ts` | Кэшируемое чтение `app_base_url` из `system_settings`. | Н | `Drizzle` | Неверные URL в интеграторе |
| `src/config/appTimezone.ts` | Кэшируемое чтение таймзоны отображения. | Н | `Drizzle` | Неверное отображение времени |
| `src/integrations/google-calendar/runtimeConfig.ts` | JSON настройки Google Calendar из `system_settings`. | Н | `Drizzle` | Сбой GCal интеграции |
| `src/kernel/domain/executor/handlers/patientHomeMorningPing.ts` | Handler: чтение настроек (`value_json`) для сценария пинга. | Н | `Drizzle` через общий helper | Дублирование логики чтения settings |

### 1.4 Блокировки и throttle

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `src/integrations/rubitime/rubitimeApiThrottle.ts` | `pg_advisory_lock` / unlock + выборка метаданных throttle. | С | `execute(sql)` или обёртка вокруг одной сессии | Взаимная блокировка API Rubitime |
| `src/infra/db/repos/schedulerLocks.ts` | `pg_try_advisory_lock` / `pg_advisory_unlock` для слотов планировщика. | С | `execute(sql)` | Двойной запуск джоба / пропуск слота |

### 1.5 Скрипты и операции

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `scripts/projection-health.mjs` | CLI: те же агрегаты outbox, что и `projectionHealth.ts`, для релизных проверок. | Н | вызывать общий TS-модуль / **`pg`** CLI | Расхождение цифр с prod-метриками |
| `src/infra/scripts/stage6-historical-time-backfill.ts` | Массовый бэкфилл времени: `BEGIN`/`COMMIT`, пары webapp/integrator клиентов, `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` на ошибках строки. | В | **`pg`** one-off; не ORM | Испорченные исторические времена |
| `src/infra/scripts/resync-rubitime-records.ts` | Ресинк записей Rubitime: динамический `UPDATE rubitime_records SET …`, выборки outbox. | С | **`pg`** или общий repo с `Drizzle` | Рассинхрон Rubitime |
| `src/infra/scripts/compare-rubitime-records.ts` | Сравнение локальных строк с внешним снимком (`input.db.query` с параметризованным SQL). | Н | **`pg`** / тонкий repo | Ложные отчёты сравнения |

---

## 2. `apps/webapp`

### 2.1 Ядро и общие утилиты

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `src/infra/db/client.ts` | Healthcheck: `select 1` на выделенном клиенте пула. | Н | **`pg`** или `getDrizzle().execute(sql)` | Низкие |
| `src/infra/adminAuditLog.ts` | Журнал админ-действий: вставка, списки/фильтры, транзакции при дедупликации. | С | `Drizzle` + `+sql` для фильтров | Комплаенс / расследования |
| `src/infra/userLifecycleLock.ts` | Транзакционные `pg_advisory_xact_lock` / shared lock по user id (сериализация жизненного цикла). | С | `execute(sql)` в Drizzle tx | Дедлоки, гонки lifecycle |
| `src/infra/multipartSessionLock.ts` | Advisory lock по id multipart-сессии. | С | `execute(sql)` в tx | Параллельные загрузки |
| `src/modules/system-settings/configAdapter.ts` | Dual-read настроек: `SELECT value_json FROM system_settings` (admin scope) с TTL-кэшем. | Н | `Drizzle` | Кэш/инвалидация уже есть |
| `src/infra/integrator-push/integratorPushOutbox.ts` | Запись и обновление статусов `integrator_push_outbox` на пуле webapp (сырой SQL). | С | `Drizzle` (схема `integrator` в unified DB) | Outbox доставки в интегратор |
| `src/infra/idempotency/pgStore.ts` | Хранилище идемпотентности API (insert/select). | С | `Drizzle` | Двойные побочные эффекты API |

### 2.2 Аутентификация и лимиты

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `src/modules/auth/channelLink.ts` | Секреты channel link: выборки, удаления, пометка `used_at`, транзакции claim. | С | `Drizzle` + tx | Захват чужого линка |
| `src/modules/auth/channelLinkClaim.ts` | Классификация «владельца» привязки: множество `SELECT count` по таблицам данных + обновление секретов в транзакции. | С | `Drizzle`; агрегаты `count` | Неверный merge/displace |
| `src/modules/auth/service.ts` | Сырой SQL в потоке аутентификации (см. файл). | С | `Drizzle` по месту использования | Безопасность сессий |
| `src/modules/auth/channelLinkStartRateLimit.ts` | Rate limit старта channel link. | Н | `Drizzle` | Обход лимита |
| `src/modules/auth/oauthStartRateLimit.ts` | Rate limit старта OAuth. | Н | `Drizzle` | Обход лимита |
| `src/modules/auth/messengerStartRateLimit.ts` | Rate limit старта мессенджера. | Н | `Drizzle` | Обход лимита |
| `src/modules/auth/checkPhoneRateLimit.ts` | Rate limit проверки телефона. | Н | `Drizzle` | Обход лимита |
| `src/modules/auth/phoneOtpLimits.ts` | OTP: очистка просроченных блокировок, upsert лимитов. | С | `Drizzle` + `delete` batch | Brute-force окно |
| `src/modules/auth/emailAuth.ts` | Email challenges: delete/update/insert по сценарию challenge. | С | `Drizzle` | Захват email / lockout |

### 2.3 Интегратор (HTTP из webapp)

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `src/modules/integrator/messengerPhoneHttpBindExecute.ts` | Привязка телефона через HTTP к интегратору: `db.query` на **отдельном** пуле интегратора + `client.query` в транзакции слияния/аудита. | В | Унифицировать с `DbPort`/`Drizzle` интегратора; webapp — тонкий клиент | Расхождение двух пулов, merge |

### 2.4 Репозитории `pg*` и медиа

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `src/infra/repos/pgDoctorBroadcastDelivery.ts` | Рассылка врача: транзакция, insert попыток доставки. | С | `Drizzle` + tx | Дубликаты попыток |
| `src/infra/repos/pgReminderProjection.ts` | Проекция напоминаний webapp ↔ integrator_user_id. | С | `Drizzle` | Рассинхрон с интегратором |
| `src/infra/repos/pgReminderRules.ts` | Правила напоминаний + синхронизация с webapp-правилами в транзакции. | В | `Drizzle` + tx + `+sql` | Двойные правила |
| `src/infra/repos/pgReminderJournal.ts` | Журнал/события напоминаний, snooze, транзакции с несколькими апдейтами. | В | `Drizzle` + tx | Неверные snooze / доставки |
| `src/infra/repos/pgSymptomDiary.ts` | Дневник симптомов: выборки, вставки, обновления, удаления, join-агрегаты. | В | `Drizzle` + `+sql` для отчётов | Потеря истории симптомов |
| `src/infra/repos/pgDoctorClients.ts` | Список клиентов врача, привязки, операции с `user_channel_bindings`. | С | `Drizzle` | Неверный состав клиентов |
| `src/infra/repos/pgLfkExercises.ts` | Каталог упражнений ЛФК: динамические списки/фильтры (`sql` строки + `pool.query`), регионы, медиа, транзакции create/update/delete. | В | поэтапно: CRUD `Drizzle`, list — `+sql` или view | CMS ЛФК, производительность списков |
| `src/infra/repos/pgLfkTemplates.ts` | Шаблоны комплексов ЛФК: тяжёлые list-запросы + транзакции правки упражнений шаблона. | В | как выше | Шаблоны врачей |
| `src/infra/repos/pgLfkDiary.ts` | Дневник ЛФК-сессий: CRUD, агрегаты по датам, удаление сессий. | С | `Drizzle` + `+sql` для агрегатов | Статистика пациента |
| `src/infra/repos/pgLfkAssignments.ts` | Назначения ЛФК пациенту в транзакции. | С | `Drizzle` + tx | Назначения пациенту |
| `src/infra/repos/pgPatientCalendarTimezone.ts` | Таймзона календаря пациента. | Н | `Drizzle` | Слоты календаря |
| `src/infra/repos/pgMediaTranscodeJobs.ts` | Очередь/статусы транскодинга в транзакции claim/update. | В | `Drizzle` + `execute(sql)` для claim при необходимости | Очередь медиа |
| `src/infra/repos/s3MediaStorage.ts` | Медиа-файлы: advisory lock по media id, delete/update статусов, транзакции с CMS-метаданными, поиск сиротских файлов. | В | `Drizzle` + advisory `execute(sql)` | Целостность медиа и S3 |
| `src/infra/repos/mediaFoldersRepo.ts` | Папки медиа: rename, проверки детей, delete. | С | `Drizzle` | Иерархия папок |
| `src/infra/repos/mediaUploadSessionsRepo.ts` | Сессии загрузки + очистка pending `media_files`. | С | `Drizzle` + tx | Зависшие pending |
| `src/infra/repos/mediaPreviewWorker.ts` | Превью воркер: длинная транзакция обновления статусов превью и связанных таблиц. | В | `Drizzle` + tx | Превью в каталоге |
| `src/infra/repos/pgBroadcastAudit.ts` | Аудит рассылок. | Н | `Drizzle` | Аудит |
| `src/infra/repos/pgSupportCommunication.ts` | Поддержка: диалоги, сообщения, служебные проверки `SELECT 1`, статусы. | В | `Drizzle` + `+sql` | Поддержка пациентов |
| `src/infra/repos/pgReferences.ts` | Справочники reference data: выборки, транзакции reorder, soft-delete. | С | `Drizzle` + tx | Порядок элементов |
| `src/infra/repos/pgAppointmentProjection.ts` | Проекция записей на приём (транзакция с несколькими шагами). | С | `Drizzle` + tx | Запись на приём |
| `src/infra/repos/pgPatientBookings.ts` | Записи пациента: вставки/обновления проекции из внешних источников. | С | `Drizzle` | Календарь пациента |
| `src/infra/repos/pgUserProjection.ts` | Связка webapp user ↔ integrator / platform_users: выборки, insert, merge-апдейты, транзакции. | В | `Drizzle` + tx; критичные пути — тесты | Идентичности пользователей |
| `src/infra/repos/pgIdentityResolution.ts` | Разрешение идентичностей по телефону/привязкам. | С | `Drizzle` + `+sql` | Неверный матч пользователя |
| `src/infra/repos/pgUserByPhone.ts` | Поиск пользователя по телефону и привязкам. | С | `Drizzle` | Логин/чужой аккаунт |
| `src/infra/repos/pgMessageLog.ts` | Логи сообщений (агрегаты/списки). | С | `Drizzle` + `+sql` | Отчёты доставки |
| `src/infra/repos/pgChannelPreferences.ts` | Настройки каналов уведомлений. | Н | `Drizzle` | Доставка уведомлений |
| `src/infra/repos/pgDoctorAppointments.ts` | Записи врача (несколько вариантов SQL по режиму). | С | `Drizzle` + `+sql` | Расписание врача |
| `src/infra/repos/pgBookingCatalog.ts` | Каталог филиалов/услуг бронирования: тяжёлые выборки и модификации. | В | поэтапно `Drizzle` + `+sql` | Каталог ТЗ и филиалов |
| `src/infra/repos/pgPhoneChallengeStore.ts` | Хранилище phone challenges (insert/select/delete). | С | `Drizzle` | OTP/SMS злоупотребления |
| `src/infra/repos/pgUserPins.ts` | Закрепления пользователя. | Н | `Drizzle` | Низкие |
| `src/infra/repos/pgLoginTokens.ts` | Токены логина. | С | `Drizzle` | Сессии |
| `src/infra/repos/pgSubscriptionMailingProjection.ts` | Проекция подписок/рассылок. | С | `Drizzle` | Рассылки |
| `src/infra/repos/pgOnlineIntake.ts` | Online intake: shared advisory lock по user id + операции заявки. | С | `Drizzle` + `execute(sql)` lock | Двойная заявка |
| `src/infra/repos/pgDiaryPurge.ts` | Purge данных дневника (advisory + delete). | С | `Drizzle` + `execute(sql)` | Удаление не тех данных |
| `src/infra/repos/pgSystemSettings.ts` | Системные настройки (транзакционные обновления при определённых сценариях). | С | `Drizzle` + sync в integrator по канону | Рассинхрон настроек |
| `src/infra/repos/pgClinicalTests.ts` | Клинические тесты: Drizzle для основной модели + **сырой** `pool.query` для usage summary. | С | добить usage `Drizzle` / `+sql` | Отчёты использования тестов |
| `src/infra/repos/pgTestSets.ts` | Наборы тестов / связка с клиническими тестами (агрегирующий `pool.query`). | С | `Drizzle` + `+sql` | Каталог тестов |
| `src/infra/repos/pgRecommendations.ts` | Рекомендации: выборка с агрегацией через `pool.query`. | С | `Drizzle` + `+sql` | Каталог рекомендаций |
| `src/infra/platformUserFullPurge.ts` | Полное удаление данных пользователя (каскады DELETE/UPDATE по множеству таблиц). | В | процедура в SQL migration **или** `Drizzle` по шагам с tx | GDPR / потеря данных |
| `src/infra/strictPlatformUserPurge.ts` | Строгий purge: delete медиа, advisory lock. | В | `Drizzle` + advisory `execute(sql)` | Медиа / блокировки |

### 2.5 App routes / server actions

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `src/app/app/doctor/content/motivation/actions.ts` | CMS мотивационных цитат: insert/list, архивация, reorder в транзакции, `pool.query`. | С | `Drizzle` + tx | Порядок цитат |
| `src/app/api/internal/media-multipart/cleanup/route.ts` | Удаление pending `media_files` при очистке multipart. | Н | `Drizzle` | Зависшие файлы |
| `src/app/api/media/multipart/init/route.ts` | При ошибке инициализации multipart — `DELETE` pending `media_files` через `getPool().query`. | Н | `Drizzle` через общий repo | Утечки pending |
| `src/app/api/doctor/clients/integrator-merge/route.ts` | Слияние клиентов: `client.query` в транзакции (интеграция с merge-пакетом). | В | делегировать в пакет + `Drizzle` на webapp стороне | Клинические данные клиентов |

### 2.6 App-layer (health / media)

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `src/app-layer/health/collectAdminSystemHealthData.ts` | Админ health: агрегаты по превью медиа и зависшим pending. | С | `Drizzle` + `+sql` | Мониторинг |
| `src/app-layer/media/adminTranscodeHealthMetrics.ts` | Метрики здоровья транскодинга. | С | `Drizzle` + `+sql` | Алерты медиа |
| `src/app-layer/media/videoHlsLegacyBackfill.ts` | Legacy HLS backfill: выборки/агрегаты по `media_files`. | С | `Drizzle` + batch update | HLS legacy |

### 2.7 Скрипты `apps/webapp/scripts`

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `run-migrations.mjs` | Кастомный раннер SQL-миграций webapp. | Н | **`pg`** | Низкие |
| `seed-drizzle-migrations-meta.mjs` | Создание `drizzle.__drizzle_migrations` и мета-строк. | Н | **`pg`** / ops | Низкие |
| `reconcile-person-domain.mjs` | Сверка/чинение person-domain данных (несколько SELECT). | С | **`pg`** или общий сервис | Исправление данных вручную |
| `seed-content-pages.mjs` | Сид контент-страниц в транзакции. | Н | `Drizzle` / **`pg`** seed | Контент |
| `verify-drizzle-public-table-count.mjs` | Верификация счётчиков строк public-таблиц. | Н | **`pg`** | Низкие |
| `user-phone-admin.ts` | Админ CLI по телефону/purge/merge: массовый сырой SQL + `integratorDb.query`. | В | **`pg`** + вызовы сервисов | Опасные ops |
| `realign-webapp-integrator-user-projection.ts` | Реалайн проекции пользователей. | С | **`pg`** / сервис | Проекция |
| `seed-booking-catalog-tochka-zdorovya.ts` | Сид каталога бронирования. | С | **`pg`** / seed pipeline | Каталог |
| `backfill-rubitime-history-to-patient-bookings.ts` | Бэкфилл истории Rubitime → `patient_bookings`. | С | **`pg`** / батч-сервис | История записей |
| `backfill-rubitime-compat-snapshots.ts` | Совместимые снапшоты Rubitime. | С | **`pg`** | Совместимость |
| `requeue-projection-outbox-dead.ts` | Переочередь dead-событий projection outbox. | С | **`pg`** / админ API | Outbox storm |
| `backfill-patient-bookings-v2.ts` | Бэкфилл patient_bookings v2. | С | **`pg`** | Записи |

### 2.8 Тесты

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `src/infra/repos/pgPlatformUserMerge.devDb.integration.test.ts` | Интеграционная очистка тестовых данных через `client.query`. | Н | **`pg`** в тесте | Только тестовая БД |

---

## 3. `apps/media-worker`

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `src/processTranscodeJob.ts` | Статусы медиа и джобов: несколько `pool.query` / `ctx.pool.query` (обновление прогресса, финализация, ошибки). | С | `Drizzle` + общий schema пакет | Рассинхрон с webapp |
| `src/jobs/claim.ts` | Claim транскодинг-джоба в транзакции (`FOR UPDATE SKIP LOCKED` + update). | В | `Drizzle` + `execute(sql)` claim | Двойной claim |

---

## 4. Пакеты `packages/`

| Файл | Назначение | Сложн. | Вариант | Риски |
|------|------------|--------|---------|-------|
| `platform-merge/src/pgPlatformUserMerge.ts` | Крупная процедура слияния платформенных пользователей: блокировки, перенос строк по десяткам таблиц, очистка дубликатов. | В | поэтапно `Drizzle`; ядро — tx + явные шаги | Критичные пользовательские данные |
| `platform-merge/src/messengerPhonePublicBind.ts` | Публичная привязка телефона мессенджера: realign/update через `db.query` (pg). | С | `Drizzle` в consumer app или общий db слой | Зависимости пакета |
| `booking-rubitime-sync/src/upsertPatientBookingFromRubitime.ts` | Upsert/delete `public.patient_bookings` при синке из Rubitime. | С | `Drizzle` | Записи пациента |

---

## 5. Как читать этот отчёт дальше

1. **Интегратор:** приоритет миграции — файлы с **частым** изменением схемы (`bookingProfilesRepo`, `outgoingDeliveryQueue`, конфиг-чтения) и **операционные скрипты**. `migrate.ts` и `client.ts` останутся точкой выполнения SQL даже при полном Drizzle на домене.  
2. **Webapp:** основная масса — `src/infra/repos/pg*.ts` и auth; Drizzle уже покрывает часть доменов, но параллельно живёт `pg` для legacy-сложных запросов.  
3. **Точечный поиск в репозитории:** `rg "pool\\.query\\(|client\\.query\\(" apps packages` и для интегратора `rg "await db\\.query\\(" apps/integrator` (имя `db` там — пул `pg`).

*Примечание:* при добавлении файлов этот документ стоит обновлять или регенерировать по тем же запросам `rg`, чтобы не расходиться с кодом.
