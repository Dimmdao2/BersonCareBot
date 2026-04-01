# Migration Contract v2: booking catalog + patient_bookings

**Дата:** 2026-04-01  
**Scope:** таблицы каталога очной записи + расширение `patient_bookings`. Online-запись не затронута.  
**СУБД:** PostgreSQL (webapp DB).

---

## 1. Новые таблицы каталога

### 1.1. `booking_cities`

Города присутствия клиники.

```sql
CREATE TABLE booking_cities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT        NOT NULL UNIQUE,        -- 'moscow' | 'spb' | ...
  title       TEXT        NOT NULL,               -- 'Москва' | 'Санкт-Петербург'
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_cities_is_active ON booking_cities(is_active);
```

**Constraints:**
- `code` — UNIQUE, lowercase slug, не изменяется после создания
- Soft delete через `is_active = false`

---

### 1.2. `booking_branches`

Физические филиалы, каждый привязан к городу.

```sql
CREATE TABLE booking_branches (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id             UUID        NOT NULL REFERENCES booking_cities(id),
  title               TEXT        NOT NULL,               -- 'Москва. Точка Здоровья'
  address             TEXT,                               -- 'Красносельский тупик, 5'
  rubitime_branch_id  TEXT        NOT NULL,               -- '17356'
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order          INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_branches_city_id   ON booking_branches(city_id);
CREATE INDEX idx_booking_branches_is_active ON booking_branches(is_active);
CREATE UNIQUE INDEX idx_booking_branches_rubitime_id ON booking_branches(rubitime_branch_id);
```

**Constraints:**
- `rubitime_branch_id` — UNIQUE (один филиал = один Rubitime branch)
- FK → `booking_cities(id)` (не CASCADE DELETE: деактивировать через `is_active`)

---

### 1.3. `booking_specialists`

Сотрудники (специалисты), каждый привязан к филиалу.

```sql
CREATE TABLE booking_specialists (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id               UUID        NOT NULL REFERENCES booking_branches(id),
  full_name               TEXT        NOT NULL,
  description             TEXT,
  rubitime_cooperator_id  TEXT        NOT NULL,           -- '34729'
  is_active               BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order              INTEGER     NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_specialists_branch_id  ON booking_specialists(branch_id);
CREATE INDEX idx_booking_specialists_is_active  ON booking_specialists(is_active);
CREATE UNIQUE INDEX idx_booking_specialists_rubitime_id
  ON booking_specialists(rubitime_cooperator_id, branch_id);
```

**Constraints:**
- `(rubitime_cooperator_id, branch_id)` — UNIQUE (сотрудник может работать в разных филиалах, но уникален в рамках одного)
- FK → `booking_branches(id)`

---

### 1.4. `booking_services`

Глобальный справочник услуг (не привязан к конкретному филиалу).

```sql
CREATE TABLE booking_services (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT        NOT NULL,               -- 'Сеанс 60 мин'
  description       TEXT,
  duration_minutes  INTEGER     NOT NULL,               -- 60
  price_minor       INTEGER     NOT NULL,               -- 600000 (в копейках/минимальных единицах)
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order        INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_booking_services_title_duration UNIQUE (title, duration_minutes)
);

CREATE INDEX idx_booking_services_is_active ON booking_services(is_active);
```

**Conventions:**
- `price_minor` хранится в минимальных единицах валюты (копейки): 6000 руб = 600000
- `duration_minutes` — целое число минут (40, 60, 90)

**Constraints:**
- `(title, duration_minutes)` — UNIQUE (`uq_booking_services_title_duration`): ключ идемпотентности для seed-скрипта; исключает дублирование услуг с одинаковым названием и длительностью

---

### 1.5. `booking_branch_services`

Связка: какая услуга доступна в каком филиале, у какого специалиста, с каким rubitime_service_id.

```sql
CREATE TABLE booking_branch_services (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id               UUID        NOT NULL REFERENCES booking_branches(id),
  service_id              UUID        NOT NULL REFERENCES booking_services(id),
  specialist_id           UUID        NOT NULL REFERENCES booking_specialists(id),
  rubitime_service_id     TEXT        NOT NULL,           -- '67591'
  is_active               BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order              INTEGER     NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_booking_branch_services UNIQUE (branch_id, service_id)
);

CREATE INDEX idx_booking_branch_services_branch_id   ON booking_branch_services(branch_id);
CREATE INDEX idx_booking_branch_services_service_id  ON booking_branch_services(service_id);
CREATE INDEX idx_booking_branch_services_is_active   ON booking_branch_services(is_active);
```

**Constraints:**
- `(branch_id, service_id)` — UNIQUE (одна услуга один раз на филиал)
- FK → `booking_branches(id)`, `booking_services(id)`, `booking_specialists(id)`
- `rubitime_service_id` хранится на уровне связки (одна услуга может иметь разные IDs в разных филиалах)

> **Архитектурное допущение:** constraint `UNIQUE (branch_id, service_id)` означает, что в рамках одного филиала каждая услуга ведётся ровно одним специалистом. Для Точки Здоровья это соответствует реальности. Если в будущем потребуется несколько специалистов на одну услугу в одном филиале — constraint нужно изменить на `UNIQUE (branch_id, service_id, specialist_id)` и обновить соответствующие уникальные индексы.

---

## 2. Изменения `patient_bookings`

Все новые колонки **nullable** — legacy-записи не ломаются.

```sql
-- FK на каталог
ALTER TABLE patient_bookings
  ADD COLUMN branch_id         UUID REFERENCES booking_branches(id),
  ADD COLUMN service_id        UUID REFERENCES booking_services(id),
  ADD COLUMN branch_service_id UUID REFERENCES booking_branch_services(id);

-- Snapshots (значения на момент записи, не изменяются после создания)
ALTER TABLE patient_bookings
  ADD COLUMN city_code_snapshot           TEXT,     -- 'moscow'
  ADD COLUMN branch_title_snapshot        TEXT,     -- 'Москва. Точка Здоровья'
  ADD COLUMN service_title_snapshot       TEXT,     -- 'Сеанс 60 мин'
  ADD COLUMN duration_minutes_snapshot    INTEGER,  -- 60
  ADD COLUMN price_minor_snapshot         INTEGER;  -- 600000

-- Rubitime ID snapshots (значения на момент записи)
ALTER TABLE patient_bookings
  ADD COLUMN rubitime_branch_id_snapshot      TEXT,  -- '17356'
  ADD COLUMN rubitime_cooperator_id_snapshot  TEXT,  -- '34729'
  ADD COLUMN rubitime_service_id_snapshot     TEXT;  -- '67591'

-- Индексы
CREATE INDEX idx_patient_bookings_branch_id         ON patient_bookings(branch_id);
CREATE INDEX idx_patient_bookings_service_id        ON patient_bookings(service_id);
CREATE INDEX idx_patient_bookings_branch_service_id ON patient_bookings(branch_service_id);
```

**Примечания:**
- Поле `category TEXT` остаётся в таблице (для legacy online path и старых in-person записей) — nullable
- Поле `city TEXT` остаётся (legacy) — nullable
- Snapshot-поля заполняются при создании новой v2-записи и **не обновляются** при изменении каталога

---

## 3. Индексы и ограничения (сводная таблица)

| Таблица | Constraint/Index | Тип |
|---|---|---|
| `booking_cities` | `code` | UNIQUE |
| `booking_branches` | `rubitime_branch_id` | UNIQUE |
| `booking_branches` | `city_id` | INDEX |
| `booking_specialists` | `(rubitime_cooperator_id, branch_id)` | UNIQUE |
| `booking_specialists` | `branch_id` | INDEX |
| `booking_services` | `(title, duration_minutes)` | UNIQUE (`uq_booking_services_title_duration`) |
| `booking_services` | `is_active` | INDEX |
| `booking_branch_services` | `(branch_id, service_id)` | UNIQUE |
| `booking_branch_services` | `branch_id`, `service_id`, `is_active` | INDEX |
| `patient_bookings` | `branch_id`, `service_id`, `branch_service_id` | INDEX |

---

## 4. Cutover-safe sequence (порядок применения)

### UP (apply)

```
Шаг 1: migration_1_booking_catalog_v2.sql
  - CREATE TABLE booking_cities
  - CREATE TABLE booking_branches
  - CREATE TABLE booking_specialists
  - CREATE TABLE booking_services
  - CREATE TABLE booking_branch_services
  → Проверка: все 5 таблиц существуют, индексы созданы

Шаг 2: migration_2_patient_bookings_v2_refs.sql
  - ADD COLUMN branch_id, service_id, branch_service_id (nullable FK)
  - ADD COLUMN *_snapshot (nullable)
  - CREATE INDEX на новые FK-поля
  → Проверка: \d patient_bookings показывает новые колонки

Шаг 3: seed-booking-catalog-tochka-zdorovya (script)
  - Upsert городов → филиалов → специалистов → услуг → branch-service связок
  → Проверка: SELECT count(*) FROM booking_branch_services > 0

Шаг 4: backfill-patient-bookings-v2 (script, --dry-run сначала)
  - Маппинг legacy записей на branch_service_id где возможно
  → Проверка: отчёт backfill без критических ошибок

Шаг 5: dual-write (в коде webapp)
  - Новые записи пишут и legacy-поля, и v2-поля
  → Проверка: новые patient_bookings имеют branch_service_id

Шаг 6: dual-read (UI + API)
  - Кабинет отображает оба типа записей
  → Проверка: mixed data рендерится корректно

Шаг 7: switch (full v2)
  - Старый path deprecated, legacy-resolve в integrator отключён
  → Проверка: CI зелёный, e2e тесты прошли

Шаг 8: disable legacy
  - bookingScheduleMapping помечается REMOVED
  → Финал: cleanup in next release
```

### DOWN (rollback)

```
Rollback шаг 2 (patient_bookings_v2_refs):
  ALTER TABLE patient_bookings
    DROP COLUMN IF EXISTS branch_id,
    DROP COLUMN IF EXISTS service_id,
    DROP COLUMN IF EXISTS branch_service_id,
    DROP COLUMN IF EXISTS city_code_snapshot,
    DROP COLUMN IF EXISTS branch_title_snapshot,
    DROP COLUMN IF EXISTS service_title_snapshot,
    DROP COLUMN IF EXISTS duration_minutes_snapshot,
    DROP COLUMN IF EXISTS price_minor_snapshot,
    DROP COLUMN IF EXISTS rubitime_branch_id_snapshot,
    DROP COLUMN IF EXISTS rubitime_cooperator_id_snapshot,
    DROP COLUMN IF EXISTS rubitime_service_id_snapshot;

Rollback шаг 1 (catalog tables):
  DROP TABLE IF EXISTS booking_branch_services;
  DROP TABLE IF EXISTS booking_specialists;
  DROP TABLE IF EXISTS booking_services;
  DROP TABLE IF EXISTS booking_branches;
  DROP TABLE IF EXISTS booking_cities;
```

**Rollback безопасен:** новые колонки nullable, их удаление не затрагивает legacy-данные. Таблицы каталога не имеют данных до шага 3 — DROP TABLE безопасен.

---

## 5. Проверка консистентности (health checks)

После каждого шага:

```sql
-- Проверить наличие таблиц каталога
SELECT table_name FROM information_schema.tables
WHERE table_name IN (
  'booking_cities', 'booking_branches', 'booking_specialists',
  'booking_services', 'booking_branch_services'
);

-- Проверить новые FK-колонки в patient_bookings
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'patient_bookings'
  AND column_name IN ('branch_id', 'service_id', 'branch_service_id');

-- Проверить seed (после шага 3)
SELECT
  (SELECT count(*) FROM booking_cities)          AS cities,
  (SELECT count(*) FROM booking_branches)        AS branches,
  (SELECT count(*) FROM booking_specialists)     AS specialists,
  (SELECT count(*) FROM booking_services)        AS services,
  (SELECT count(*) FROM booking_branch_services) AS branch_services;

-- Проверить dual-write (после шага 5)
SELECT count(*) FROM patient_bookings
WHERE branch_service_id IS NOT NULL
  AND created_at > now() - interval '1 hour';
```
