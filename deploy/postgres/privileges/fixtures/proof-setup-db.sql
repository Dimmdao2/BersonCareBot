-- proof-setup-db.sql — состояние базы ДО генератора (живой дефект). Применяется к одноразовой
-- базе `bcb_privproof` на временном кластере. Продолжение `proof-setup.sql` (кластерные роли).
--
-- Всё, что здесь есть, — власть МИГРАЦИЙ (DDL + тела definer-функций), а НЕ генератора
-- (SCHEME §B). Гранты ниже — не «цель», а СЕГОДНЯШНЕЕ ЖИВОЕ состояние с дефектами.

\set ON_ERROR_STOP on

CREATE SCHEMA app AUTHORIZATION app_owner;
GRANT USAGE ON SCHEMA app TO app_staff, app_patient;

-- ── аксессор принципала (в живой базе — app.current_org_id(), definer, proconfig=pg_catalog) ──
CREATE FUNCTION app.current_org_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
ALTER FUNCTION app.current_org_id() OWNER TO app_owner;

-- ── таблицы (форма — из apps/webapp/db/schema/) ──
SET ROLE bcb_proof_migrator;

CREATE TABLE public.phone_challenges (
  challenge_id text PRIMARY KEY NOT NULL,
  phone text NOT NULL,
  expires_at bigint NOT NULL,
  code text,                       -- ⚠ ОТП ОТКРЫТЫМ ТЕКСТОМ
  channel_context jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  verify_attempts smallint DEFAULT 0 NOT NULL
);

CREATE TABLE public.be_organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,   -- признак org-таблицы (SCHEME §E)
  platform_user_id uuid NOT NULL,
  role text NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.integrator_push_outbox (
  id bigserial PRIMARY KEY NOT NULL,
  kind text NOT NULL,
  idempotency_key text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

RESET ROLE;

-- ── ШТАТНЫЙ путь к ОТП: definer-аксессор. Контракт кода (pgPublicBookingOtp.ts:6-8): вызывающей
--    роли нужен EXECUTE на функцию и НИЧЕГО на public.phone_challenges. ──
CREATE FUNCTION app.public_booking_otp_issue(p_phone text) RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = app, pg_catalog
AS $$ SELECT code FROM public.phone_challenges WHERE phone = p_phone ORDER BY created_at DESC LIMIT 1 $$;
ALTER FUNCTION app.public_booking_otp_issue(text) OWNER TO app_owner;


-- ── данные: 4 строки, ровно как в живой переписи («SET ROLE app_staff → 4 строки») ──
INSERT INTO public.phone_challenges (challenge_id, phone, expires_at, code) VALUES
  ('ch-1', '+79990000001', 1786000000, '111222'),
  ('ch-2', '+79990000002', 1786000000, '333444'),
  ('ch-3', '+79990000003', 1786000000, '555666'),
  ('ch-4', '+79990000004', 1786000000, '777888');

INSERT INTO public.be_organization_members (organization_id, platform_user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'doctor'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'doctor');

INSERT INTO public.integrator_push_outbox (kind, idempotency_key) VALUES ('push', 'k-1');

-- ── ЖИВЫЕ ДЕФЕКТЫ (то, что генератор обязан снести) ──
-- Д1: прямой табличный грант арендной роли на таблицу с ОТП открытым текстом
--     (FINDINGS_TABLES.md часть 3, Н2). RLS выключен, политик нет.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.phone_challenges TO app_staff;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.phone_challenges TO app_owner;

-- Д2: org-таблица БЕЗ RLS — доктор чужой клиники видит чужие членства (FACTS §1.2-1.3).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.be_organization_members TO app_staff;
GRANT SELECT ON TABLE public.be_organization_members TO app_patient;   -- лишний грант: цель его снимает

-- Д3: PUBLIC EXECUTE на definer-функции — неявный дефолт PostgreSQL (evidence/12 §1).
--     (создан автоматически; здесь показан явно, чтобы дефект был виден в снимке ДО)
GRANT EXECUTE ON FUNCTION app.public_booking_otp_issue(text) TO app_staff;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.integrator_push_outbox TO app_staff;
GRANT USAGE, SELECT ON SEQUENCE public.integrator_push_outbox_id_seq TO app_staff;
