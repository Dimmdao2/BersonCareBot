-- Руbitime: справочники филиалов, услуг, специалистов и профили записи.
-- Заменяет env RUBITIME_SCHEDULE_MAPPING JSON.

CREATE TABLE IF NOT EXISTS rubitime_branches (
  id                  BIGSERIAL PRIMARY KEY,
  rubitime_branch_id  INTEGER   NOT NULL UNIQUE,
  city_code           TEXT      NOT NULL,
  title               TEXT      NOT NULL,
  address             TEXT      NOT NULL DEFAULT '',
  is_active           BOOLEAN   NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rubitime_services (
  id                   BIGSERIAL PRIMARY KEY,
  rubitime_service_id  INTEGER   NOT NULL UNIQUE,
  title                TEXT      NOT NULL,
  category_code        TEXT      NOT NULL,
  duration_minutes     INTEGER   NOT NULL CHECK (duration_minutes > 0),
  is_active            BOOLEAN   NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rubitime_cooperators (
  id                      BIGSERIAL PRIMARY KEY,
  rubitime_cooperator_id  INTEGER   NOT NULL UNIQUE,
  title                   TEXT      NOT NULL,
  is_active               BOOLEAN   NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Профили записи: связка доменного запроса (type/category/city) с Rubitime-сущностями.
-- Уникальность: одна активная комбинация type+category+(city или '') на строку.
CREATE TABLE IF NOT EXISTS rubitime_booking_profiles (
  id             BIGSERIAL PRIMARY KEY,
  booking_type   TEXT      NOT NULL CHECK (booking_type IN ('online', 'in_person')),
  category_code  TEXT      NOT NULL,
  city_code      TEXT      NULL,
  branch_id      BIGINT    NOT NULL REFERENCES rubitime_branches(id),
  service_id     BIGINT    NOT NULL REFERENCES rubitime_services(id),
  cooperator_id  BIGINT    NOT NULL REFERENCES rubitime_cooperators(id),
  is_active      BOOLEAN   NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- COALESCE(city_code,'') позволяет хранить уникальность даже при NULL city_code.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rbp_type_category_city
  ON rubitime_booking_profiles (booking_type, category_code, COALESCE(city_code, ''));

CREATE INDEX IF NOT EXISTS idx_rbp_is_active
  ON rubitime_booking_profiles (is_active);
