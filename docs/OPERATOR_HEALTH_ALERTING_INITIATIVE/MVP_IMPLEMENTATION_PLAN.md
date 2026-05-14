# MVP — Operator Health & Alerting (реализация)

Канон инициативы: [MASTER_PLAN.md](MASTER_PLAN.md). Полные фазы: [PHASE_A](PHASE_A_DATA_MODEL_AND_CORE_ALERTING.md) … [PHASE_G](PHASE_G_TESTS_AND_DOCS.md). Журнал: [LOG.md](LOG.md).

Этот документ — **исполняемый план MVP** с фиксированными решениями, чтобы избежать scope creep и двусмысленностей.

---

## 1. Цель MVP

- Персистентные **операторские инциденты** с дедупом и **одним** Telegram-алертом при первом открытии.
- Событийная регистрация сбоев синка Google Calendar в **обоих** рубитайм-путях обработки.
- Две регулярные пробы исходящей доступности: **MAX** (`getMyInfo`) и **Rubitime** (`get-schedule`).
- Отображение открытых инцидентов в admin «Здоровье системы».
- Управляемый lifecycle PostgreSQL-бэкапов: ретенция + очистка + статус выполнения в admin health по **`job_key`** `backup.hourly` / `backup.daily` / `backup.weekly` / `backup.pre_migrations` / `backup.manual` / `backup.prune` и **`job_family=backup`**.

---

## 2. Fixed decisions (обязательные для MVP)

1. **Dedup key:** `direction:integration:error_class` (без `recordId`).
2. **GCal сбой:** `direction = outbound`, `integration = google_calendar`.
3. **Оба GCal entrypoint под хук инцидентов:**  
   - [postCreateProjection.ts](../../apps/integrator/src/integrations/rubitime/postCreateProjection.ts)  
   - [webhook.ts](../../apps/integrator/src/integrations/rubitime/webhook.ts)
4. **Таблица:** `public.operator_incidents`.
5. **Пробы:** только MAX + Rubitime.
6. **Endpoint проб:** только защищённый (`integratorWebhookSecret`), без публичного unauthenticated доступа.
7. **Resolution в MVP:** автоматический `resolve` **только по успешным пробам** MAX/Rubitime; без Telegram «восстановлено».
8. **Ретенция бэкапов (фиксируем в MVP):**
   - `hourly`: хранить **48 часов**;
   - `daily`: хранить **35 дней**;
   - `weekly`: хранить **12 недель**;
   - `pre-migrations`: хранить **минимум 30 дней и не менее 20 последних** (`age <= 30d OR входит в top-20 newest`).
9. **Реализация очистки (фиксируем):** без нового постоянного systemd-демона; использовать host cron + новый lifecycle-runner в `postgres-backup.sh` (mode `prune`) с запуском 1 раз в сутки в тихое окно.
10. **Телеметрия запусков:** один upsert в БД на завершение джобы (`success|failure`, `duration_ms`, `last_success_at`/`last_failure_at`) для каждого класса бэкапа.

---

## 3. Scope boundaries

### In scope

- `operator_incidents` schema + migration.
- Integrator repo/service для `reportFailure` и `resolveByPrefix`.
- Хуки GCal fail в двух обработчиках Rubitime.
- Probe runner (MAX + Rubitime) + scheduler trigger.
- Webapp read/API/UI (блок открытых инцидентов).
- Backup lifecycle: weekly режим, prune-логика, cron-профили запуска, и DB-тик статуса выполнения для backup jobs.
- Тесты и док-обновления по затронутым участкам.

### Out of scope

- Last webhook health-таблица (фаза C).
- Recovery notifications в TG/email (фаза E).
- Auto-merge / media-worker / projection debounce алерты.
- Пробы Telegram, GCal-only probe, SMSC, SMTP.
- UI-действия «закрыть инцидент».
- Перенос бэкапов во внешнее объектное хранилище (S3/Glacier) и cross-region DR-процедуры.
- Full event-log каждой ротации файла; в MVP храним агрегированный last-run status по job key.

---

## 4. Data contract MVP

### 4.1 Таблица `public.operator_incidents`

Минимальные поля:

- `id` uuid pk
- `dedup_key` text not null
- `direction` text not null (`outbound` | `inbound_webhook` | `internal`)
- `integration` text not null (`google_calendar` | `rubitime` | `max`)
- `error_class` text not null
- `error_detail` text null (truncate до 500–1000)
- `opened_at` timestamptz not null default now()
- `last_seen_at` timestamptz not null default now()
- `occurrence_count` integer not null default 1
- `resolved_at` timestamptz null
- `alert_sent_at` timestamptz null

Индексы:

- уникальность открытого: `UNIQUE (dedup_key) WHERE resolved_at IS NULL`
- чтение для UI: индекс на `last_seen_at DESC` с фильтром `resolved_at IS NULL`

### 4.2 `error_class` taxonomy (MVP)

- `GOOGLE_TOKEN_HTTP_*`, `GOOGLE_CALENDAR_HTTP_*`, `GOOGLE_EVENT_ID_MISSING`
- `max_probe_failed`
- `rubitime_get_schedule_failed`
- fallback: `unknown_error_class`

### 4.3 Таблица статуса периодических job (`public.operator_job_status`, MVP)

Минимальные поля:

- `job_key` text pk (`backup.hourly`, `backup.daily`, `backup.weekly`, `backup.pre_migrations`, `backup.prune`)
- `job_family` text not null (`backup`)
- `last_status` text not null (`success` | `failure`)
- `last_started_at` timestamptz null
- `last_finished_at` timestamptz null
- `last_success_at` timestamptz null
- `last_failure_at` timestamptz null
- `last_duration_ms` integer null
- `last_error` text null (truncate)
- `meta_json` jsonb not null default `'{}'::jsonb` (например: `{"mode":"hourly","filesCreated":2}`)

Индексы:

- `job_family`, `job_key`
- `last_finished_at DESC`

---

## 5. План реализации (шаги + проверки)

Порядок: **A1 → A2 → B1 → B2 → C1 → C2 → D1 → E1 → E2 → E3 → E4**.

### A1 — Миграция и схема

Изменения:

- [apps/webapp/db/schema](../../apps/webapp/db/schema) — добавить таблицу.
- Сгенерировать миграцию Drizzle.

Проверки:

- `rg "operator_incidents" apps/webapp/db/schema apps/webapp/db/migrations`
- Целевая проверка миграции в локальной БД.

Критерий закрытия:

- Таблица создаётся с нужными индексами, rollback/повторный apply не ломаются.

---

### A2 — Integrator repo + reportFailure

Изменения:

- [apps/integrator/src/infra/db/repos](../../apps/integrator/src/infra/db/repos) — repo `openOrTouchIncident`.
- Новый helper/service для формирования `dedup_key`, отправки TG только при первом открытии.
- Использовать паттерн из [dataQualityIncidentAlert.ts](../../apps/integrator/src/infra/db/dataQualityIncidentAlert.ts) (`eventId` <= 240).

Проверки:

- Unit на гонку: 2 параллельных открытия одного ключа -> 1 открытая запись.
- Unit на повтор: `occurrence_count` растёт, Telegram второй раз не уходит.

Критерий закрытия:

- `reportFailure` идемпотентен и безопасен при concurrency.

---

### B1 — Хуки GCal fail в двух местах

Изменения:

- [postCreateProjection.ts](../../apps/integrator/src/integrations/rubitime/postCreateProjection.ts)
- [webhook.ts](../../apps/integrator/src/integrations/rubitime/webhook.ts)

Проверки:

- `rg "google calendar sync failed" apps/integrator/src/integrations/rubitime`
- Тест: мок `syncRubitimeWebhookBodyToGoogleCalendar` бросает ошибку -> `reportOperatorFailure` вызван (`webhook.operatorIncident.test.ts` и покрытие в `postCreateProjection`).

Критерий закрытия:

- Любой GCal fail в рубитайм-потоке открывает/обновляет один инцидент по `error_class` (`reportOperatorFailure`).

---

### B2 — MVP probe runner (MAX + Rubitime)

Изменения:

- Модуль раннера проб в integrator (`infra`/`app` слой, без смешения с webhook handlers).
- MAX probe через `getMaxBotInfo`.
- Rubitime probe через `fetchRubitimeSchedule` с envelope-проверкой `status: ok`; пустые слоты не считаются fail.

Проверки:

- Nock/моки на оба probe-пути.
- Таймауты на внешний fetch.

Критерий закрытия:

- Пробы дают `ok|fail|skipped_not_configured` и пишут инциденты только для `fail`.

---

### C1 — Scheduler + защищённый trigger

Изменения:

- Защищённый internal endpoint (например `POST /internal/operator-health-probe`) в integrator.
- Подпись **`x-bersoncare-timestamp`** + **`x-bersoncare-signature`** (HMAC-SHA256 `timestamp + '.' + rawBody`, secret — `INTEGRATOR_WEBHOOK_SECRET` или `INTEGRATOR_SHARED_SECRET` из `api.prod`).
- **Хост-вызов:** скрипт репозитория [`deploy/host/operator-health-probe.sh`](../../deploy/host/operator-health-probe.sh) + операционная инструкция в [`deploy/HOST_DEPLOY_README.md`](../../deploy/HOST_DEPLOY_README.md) (cron / systemd timer).
- Один механизм запуска на проде: **cron** или **systemd timer** (выбрать и зафиксировать в [LOG.md](LOG.md)).

Проверки:

- Без секрета endpoint возвращает отказ.
- С секретом запускает runner.

Критерий закрытия:

- Пробы запускаются по расписанию и недоступны извне без секрета.

---

### C2 — Минимальный resolve в MVP

Изменения:

- На успешной probe MAX/Rubitime: `resolve` по префиксу `outbound:max:*` / `outbound:rubitime:*`.
- Для GCal auto-resolve в MVP **не добавлять**.

Проверки:

- Unit: fail -> open, success -> resolved_at set (см. `operatorHealthProbeRunner.test.ts`, моки MAX/Rubitime).
- Unit: `resolveOpenOperatorIncidentsByDedupKeyPrefix` возвращает число обновлённых строк (`operatorHealthDrizzle.resolve.test.ts`).
- Повторный success не меняет состояние критично (идемпотентно).

Критерий закрытия:

- Открытые probe-инциденты не копятся бесконечно после восстановления канала.

---

### D1 — Webapp read/API/UI

Изменения:

- Порт в `modules/*`, реализация в `infra/repos/*` (соблюсти clean architecture).
- [buildAppDeps.ts](../../apps/webapp/src/app-layer/di/buildAppDeps.ts) wiring.
- [system-health/route.ts](../../apps/webapp/src/app/api/admin/system-health/route.ts) расширить полем `operatorIncidentsOpen` (limit 20).
- [SystemHealthSection.tsx](../../apps/webapp/src/app/app/settings/SystemHealthSection.tsx): блок списка открытых инцидентов.

Проверки:

- [system-health/route.test.ts](../../apps/webapp/src/app/api/admin/system-health/route.test.ts): 403 guard, happy-path payload.
- UI test: рендер блока при непустом `operatorIncidentsOpen`.

Критерий закрытия:

- Админ видит открытые инциденты в текущей вкладке здоровья.

---

### E1 — Backup lifecycle policy + script modes

Изменения:

- [deploy/postgres/postgres-backup.sh](../../deploy/postgres/postgres-backup.sh):
  - добавить mode `weekly` (выгрузка в `/opt/backups/postgres/weekly`);
  - добавить mode `prune` (retention policy по fixed decisions);
  - при совпадающих `DATABASE_URL` у `api.prod` и `webapp.prod` делать **один** `pg_dump` вместо двух идентичных (снижение нагрузки).

Проверки:

- `rg "weekly|prune" deploy/postgres/postgres-backup.sh deploy/postgres/README.md`
- локальный dry-run prune на тестовой директории (без удаления за пределами `/opt/backups/postgres/*`).

Критерий закрытия:

- Скрипт стабильно создаёт weekly backup и удаляет только файлы вне retention policy.

---

### E2 — Backup status ticks в БД (one-row-per-job)

Изменения:

- `apps/webapp/db/schema/**` + migration: `public.operator_job_status`.
- В webapp health-агрегатор добавить чтение `backup`-job status.
- В backup lifecycle runner: после завершения `hourly/daily/weekly/pre-migrations/prune` писать upsert в `operator_job_status`.

Проверки:

- Unit: upsert idempotent (повтор same job_key обновляет одну запись).
- Негатив: при fail фиксируются `last_status=failure`, `last_failure_at`, `last_error`.

Критерий закрытия:

- В БД по каждому backup job key всегда есть актуальный last-run статус.

---

### E3 — Scheduler strategy (нагрузка и классический подход)

Решение:

- Не поднимать новый долгоживущий node/systemd worker только ради очистки.
- Использовать **host cron** (лёгкий и надёжный для file-retention задач):
  - `hourly`: каждый час;
  - `daily`: раз в сутки в тихое окно;
  - `weekly`: раз в неделю;
  - `prune`: 1 раз в сутки после daily (или отдельным cron в то же окно).

Проверки:

- `deploy/HOST_DEPLOY_README.md`: добавить каноничные cron snippets.
- smoke: один ручной запуск каждого режима возвращает code 0 при корректном env.

Критерий закрытия:

- Нет нового service-unit, а очистка работает штатно по cron без заметного постоянного CPU/IO следа.

---

### E4 — UI/health surfaces для backup tiers

Изменения:

- `GET /api/admin/system-health`: секция `backupJobs` с key/value по **`job_key`** (`backup.hourly`, `backup.daily`, …).
- `SystemHealthSection.tsx`: отдельный компактный блок статуса backup tiers (last success/failure, age, error summary).

Проверки:

- route test на payload `backupJobs` (ключи `backup.*`).
- UI smoke: видим раздельно `backup.hourly`, `backup.daily`, `backup.weekly`, `backup.pre_migrations` (и опционально `backup.prune`).

Критерий закрытия:

- Админ видит, какой именно тип backup последним прошёл/упал, без чтения syslog на хосте.

---

## 6. Файлы, которые разрешено менять

- `apps/webapp/db/schema/**`, `apps/webapp/db/migrations/**`
- `apps/integrator/src/infra/**`, `apps/integrator/src/app/**`, `apps/integrator/src/integrations/rubitime/**`
- `apps/webapp/src/modules/**` (порты/сервисы), `apps/webapp/src/infra/repos/**`, `apps/webapp/src/app/api/admin/**`, `apps/webapp/src/app/app/settings/**`
- `deploy/postgres/**`, `deploy/HOST_DEPLOY_README.md`
- `docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/**`, `apps/webapp/src/app/api/api.md`

Не менять в MVP:

- unrelated домены (courses, patient flows вне health), CI workflow.

---

## 7. Definition of Done (MVP)

Статус на **2026-05-14** (синхронизация с кодом в репозитории):

- [x] Один открытый инцидент на `outbound:google_calendar:{error_class}` при множественных однотипных ошибках.
- [x] GCal fail учитывается из обоих путей: `postCreateProjection` и `webhook`.
- [x] Пробы MAX и Rubitime: раннер, защищённый `POST /internal/operator-health-probe`, таймауты; Rubitime `status: ok`, пустые слоты не fail.
- [ ] Регулярный **запуск** проб на **прод-хосте** (cron/systemd → integrator probe): код готов, **каноничный сниппет в `deploy/HOST_DEPLOY_README.md` / SERVER CONVENTIONS не зафиксирован** — операционный хвост.
- [x] Probe trigger защищён секретом.
- [x] В admin health виден список открытых инцидентов.
- [x] Для probe-инцидентов есть минимальный auto-resolve без recovery-нотификаций.
- [x] Введена и задокументирована retention policy: hourly 48h, daily 35d, weekly 12w, pre-migrations (30d + top-20).
- [x] Backup lifecycle выполняет prune по расписанию без отдельного нового daemon worker.
- [x] В admin health виден раздельный статус backup tiers по ключам `backup.hourly` / `backup.daily` / `backup.weekly` / `backup.pre_migrations` (+ `backup.prune`).
- [x] Для каждого backup job key пишется last-run tick в БД (`success|failure`, `duration`, timestamps).
- [x] Нет новых env для интеграционных ключей; параметры через `system_settings` только если нужны.
- [x] Перед merge: зелёный `pnpm run ci`.

**Не в DoD, но в чеклисте A2 плана:** unit на конкурентный `openOrTouch` по одному dedup_key — по желанию (в БД partial unique + onConflict).

---

## 8. Риски и смягчение

| Риск | Смягчение |
|------|-----------|
| Rubitime throttle конфликтует с пиком записи | запуск пробы в тихом окне + уважать `withRubitimeApiThrottle` |
| MAX отключён/не настроен | `skipped_not_configured`, без открытия инцидента |
| Рост таблицы | для MVP без retention; post-MVP добавить архив/TTL |
| Секрет случайно не проверяется в endpoint | обязательный negative-test без секрета |
| Лишняя нагрузка от очистки бэкапов | prune 1 раз/сутки в тихое окно, без постоянного daemon |
| Потеря точки отката pre-migrations | политика "30d + минимум top-20 newest", а не только age-based delete |

---

## 9. Оценка

**7–10 инженерных дней**, ~3.5–6k LOC с тестами и host-runbook обновлениями.

---

## 10. Трекинг задач (markdown)

Статус на **2026-05-14**:

- [x] A1: schema + migration `public.operator_incidents` (+ `operator_job_status`, 0057/0058)
- [x] A2: integrator repo + `reportOperatorFailure` (+ опционально: concurrency unit — см. §7)
- [x] B1: GCal fail hooks в `postCreateProjection.ts` и `webhook.ts`
- [x] B2: probe runner (MAX + Rubitime)
- [x] C1: защищённый endpoint + тесты для probe
- [ ] C1b (ops): периодический вызов probe на хосте — см. §7 (не блокирует наличие кода)
- [x] C2: minimal auto-resolve probe incidents
- [x] D1: webapp read/API/UI + tests
- [x] E1: backup weekly+prune modes + retention policy
- [x] E2: `operator_job_status` schema + DB ticks for backup jobs
- [x] E3: cron strategy and host docs for backup lifecycle (backup; probe cron — хвост)
- [x] E4: system-health payload/UI block for backup tiers
- [x] Docs: `LOG.md`, `api.md`, итоговые проверки и CI
