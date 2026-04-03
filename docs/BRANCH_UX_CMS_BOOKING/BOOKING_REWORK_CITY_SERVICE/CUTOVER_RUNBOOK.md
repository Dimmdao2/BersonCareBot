# Cutover runbook: booking catalog v2 + integrator bridge

Операционный порядок переключения очной записи на явные Rubitime ID (webapp → integrator v2) и отключения legacy-resolve в integrator.

## Предпосылки

- Миграции `046_booking_catalog_v2.sql` и `047_patient_bookings_v2_refs.sql` применены на целевой БД.
- `DATABASE_URL` webapp указывает на эту БД; integrator использует ту же БД для legacy `rubitime_*` таблиц (если они ещё нужны для online v1).
- Резервная копия БД сделана перед cutover.

## Порядок работ

### 1. Migration

Применить SQL-миграции webapp из `apps/webapp/migrations/` (включая `046_*`, `047_*`), с установленным `DATABASE_URL` на целевую БД:

```bash
# из корня репозитория
pnpm --filter webapp run migrate
```

Скрипт: `apps/webapp/scripts/run-migrations.mjs`. При необходимости ручного применения — выполнить соответствующие `.sql` через `psql` в согласованном порядке.

Проверка:

```sql
SELECT to_regclass('public.booking_cities');
SELECT to_regclass('public.booking_branch_services');
\d patient_bookings
```

### 2. Seed каталога

```bash
pnpm --filter webapp run seed-booking-catalog
# или: tsx scripts/seed-booking-catalog-tochka-zdorovya.ts
```

Проверка (пример):

```sql
SELECT count(*) FROM booking_cities;
SELECT count(*) FROM booking_branch_services;
```

### 3. Backfill legacy `patient_bookings`

Сначала dry-run:

```bash
pnpm --filter webapp run backfill-patient-bookings-v2
```

Затем с записью:

```bash
pnpm --filter webapp run backfill-patient-bookings-v2 -- --commit
```

Проверка:

```sql
SELECT count(*) FROM patient_bookings WHERE branch_service_id IS NOT NULL;
```

### 4. Dual-write

Убедиться, что новые очные бронирования пишут v2 поля и вызывают integrator с `version: "v2"` (см. `CUTOVER_DB_PLAN.md`, фаза 1). Smoke: одна тестовая запись через UI/API.

### 5. Switch (продолжить трафик на v2)

- Webapp уже шлёт explicit IDs; integrator обрабатывает `/slots` и `/create-record` для `version: "v2"` без `resolveBookingProfile`.
- Мониторинг 4xx/5xx на M2M endpoints integrator.

### 6. Отключить legacy-resolve в integrator (только in-person safe mode)

**ВАЖНО: legacy-off не делать глобально до завершения online migration path (Stage 9–12).**

Online-поток (`type: online`) пока остаётся на v1 (category/city). Глобальное `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=false` отключит **оба** v1-пути — in-person и online — что сломает online до его переноса на intake-модель.

**Безопасный gate перед отключением legacy:**

- [x] Online LFK и nutrition переведены на intake-сценарий (Stage 12 завершён). Evidence: `EXECUTION_LOG.md` §Stage 12; маршруты `/app/patient/intake/lfk`, `/app/patient/intake/nutrition`.
- [ ] **Операторский критерий:** online-записи больше не создаются через Rubitime v1 slots/create (подтверждение по логам/метрикам на целевой среде).
- [ ] **Операторский критерий:** 7 дней без v1-запросов online в integrator-логах.

**Документированное закрытие (variant B):** пункт выше про intake (6.1) закрыт в docs; **6.2–6.3** остаются чекбоксами для оператора до фактического `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=false`. См. `CHECKLISTS.md` §7.

После закрытия gate можно выполнить:

```bash
export RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=false
# перезапуск unit systemd / контейнера
```

Для одноразового cutover env допустим; долгосрочно можно вынести в `system_settings` (scope `admin`).

Ожидаемое поведение после отключения:

- Запросы **v1** (без `version: "v2"`), зависящие от `rubitime_booking_profiles`, получают `400` с `error: legacy_resolve_disabled`.
- Запросы **v2** с явными ID продолжают работать.

Откат: вернуть переменную в `true` или удалить (по умолчанию включено).

### 7. Включить compat-sync (Stage 11)

Compat-sync включается автоматически после деплоя webapp с миграциями `048_online_intake.sql` и `049_patient_bookings_compat_source.sql`.

После деплоя проверить:

```bash
# Применить новые миграции
pnpm --filter webapp run migrate
```

Проверка таблиц:

```sql
SELECT to_regclass('public.platform_users');
SELECT to_regclass('public.online_intake_requests');
SELECT to_regclass('public.online_intake_answers');
SELECT to_regclass('public.online_intake_attachments');
SELECT to_regclass('public.online_intake_status_history');
SELECT column_name FROM information_schema.columns
WHERE table_name = 'patient_bookings' AND column_name IN ('source', 'compat_quality');
```

Мониторинг compat-rows за первые 24h:

```sql
SELECT count(*), source, compat_quality
FROM patient_bookings
WHERE created_at > now() - interval '24 hours'
GROUP BY source, compat_quality;
```

Rollback compat-sync (feature switch): для отключения CREATE-path достаточно закомментировать compat-create branch в `pgPatientBookings.upsertFromRubitime` и деплоить патч. Данные уже созданные compat-rows не удаляются.

## Проверки консистентности

```sql
-- Новые записи с каталогом (native)
SELECT id, branch_service_id, rubitime_id, source, compat_quality, created_at
FROM patient_bookings
WHERE created_at > now() - interval '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- Сироты без Rubitime id при статусе confirmed (аномалия)
SELECT id, status, rubitime_id FROM patient_bookings
WHERE status = 'confirmed' AND rubitime_id IS NULL;

-- Compat rows (Rubitime manual bookings)
SELECT count(*), source, compat_quality
FROM patient_bookings
GROUP BY source, compat_quality;

-- Дубли по rubitime_id (должно быть пусто)
SELECT rubitime_id, count(*) as cnt
FROM patient_bookings
WHERE rubitime_id IS NOT NULL
GROUP BY rubitime_id
HAVING count(*) > 1;

-- Online intake заявки за последние 7 дней
SELECT type, status, count(*)
FROM online_intake_requests
WHERE created_at > now() - interval '7 days'
GROUP BY type, status
ORDER BY type, status;
```

## План отката

1. **Integrator:** `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=true` (или unset), рестарт — восстановить v1 путь через профили.
2. **Webapp:** откат деплоя на версию без обязательного v2 (только если катастрофа; обычно достаточно integrator-флага).
3. **БД:** откат миграций только по согласованию (down из миграций опасен при данных); предпочтительно восстановление из бэкапа.

## Known limitations (Stage 11 compat-sync)

- Если клиент в Rubitime зарегистрирован с другим телефоном, чем в Webapp, `user_id` будет null → запись не привязана к учётной записи пациента.
- Если webhook payload не содержит `serviceId` / `branchId`, `branch_service_id` не resolved → `compat_quality = 'minimal'`.
- Исторические записи (до деплоя Stage 11) не синхронизируются автоматически (нужен backfill script при необходимости).
- Нотификации online-intake доставляются best-effort (ошибки релея не блокируют создание intake-заявки).

## Связанные документы

- `CUTOVER_DB_PLAN.md` — фазы dual-read / full switch на стороне БД.
- `STAGE_5_INTEGRATOR_BRIDGE_AND_CUTOVER.md` — задачи этапа + policy legacy-off.
- `COMPATIBILITY_RUBITIME_WEBAPP.md` — DoD compat-sync и monitoring queries.
- `apps/integrator/src/integrations/rubitime/LEGACY_BOOKING_PROFILES.md` — смысл legacy таблиц и флага.
