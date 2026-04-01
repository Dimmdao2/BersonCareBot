-- Migration 046: Booking catalog v2 (cities / branches / specialists / services / branch_services)
-- Source: docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/MIGRATION_CONTRACT_V2.md
-- Scope: in-person booking rework. Online flow is not affected.
-- All tables are additive (no existing tables modified).

-- 1. Cities

CREATE TABLE IF NOT EXISTS booking_cities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT        NOT NULL UNIQUE,
  title       TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_cities_is_active ON booking_cities(is_active);

-- 2. Branches (one branch per city)

CREATE TABLE IF NOT EXISTS booking_branches (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id             UUID        NOT NULL REFERENCES booking_cities(id),
  title               TEXT        NOT NULL,
  address             TEXT,
  rubitime_branch_id  TEXT        NOT NULL,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order          INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_branches_city_id   ON booking_branches(city_id);
CREATE INDEX IF NOT EXISTS idx_booking_branches_is_active ON booking_branches(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_branches_rubitime_id ON booking_branches(rubitime_branch_id);

-- 3. Specialists (one specialist per branch; UNIQUE per cooperator+branch)

CREATE TABLE IF NOT EXISTS booking_specialists (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id               UUID        NOT NULL REFERENCES booking_branches(id),
  full_name               TEXT        NOT NULL,
  description             TEXT,
  rubitime_cooperator_id  TEXT        NOT NULL,
  is_active               BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order              INTEGER     NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_specialists_branch_id  ON booking_specialists(branch_id);
CREATE INDEX IF NOT EXISTS idx_booking_specialists_is_active  ON booking_specialists(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_specialists_rubitime_id
  ON booking_specialists(rubitime_cooperator_id, branch_id);

-- 4. Services (global catalog, not branch-specific)

CREATE TABLE IF NOT EXISTS booking_services (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT        NOT NULL,
  description       TEXT,
  duration_minutes  INTEGER     NOT NULL,
  price_minor       INTEGER     NOT NULL,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order        INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_booking_services_title_duration UNIQUE (title, duration_minutes)
);

CREATE INDEX IF NOT EXISTS idx_booking_services_is_active ON booking_services(is_active);

-- 5. Branch-service links (which service is available at which branch by which specialist)
--    Architectural assumption: one specialist per service per branch (UNIQUE branch_id, service_id).

CREATE TABLE IF NOT EXISTS booking_branch_services (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id           UUID        NOT NULL REFERENCES booking_branches(id),
  service_id          UUID        NOT NULL REFERENCES booking_services(id),
  specialist_id       UUID        NOT NULL REFERENCES booking_specialists(id),
  rubitime_service_id TEXT        NOT NULL,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order          INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_booking_branch_services UNIQUE (branch_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_branch_services_branch_id   ON booking_branch_services(branch_id);
CREATE INDEX IF NOT EXISTS idx_booking_branch_services_service_id  ON booking_branch_services(service_id);
CREATE INDEX IF NOT EXISTS idx_booking_branch_services_is_active   ON booking_branch_services(is_active);
