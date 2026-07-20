-- U6B-0: one server-owned organization slug namespace.
-- Owner canon: OWNER_REVIEW_2026-07-18.md §20 and IMPLEMENTATION_ROADMAP.md U6B.
-- This migration creates no public route and publishes no organization. It only reserves durable
-- lookup keys; authorization continues to derive from trusted organization/business objects.

DO $preflight$
DECLARE
  v_invalid_existing integer;
BEGIN
  IF to_regclass('public.clinic_public_directory_entries') IS NULL
    OR to_regclass('public.be_organizations') IS NULL
    OR to_regclass('public.platform_users') IS NULL
    OR to_regprocedure('app.current_org_id()') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff')
  THEN
    RAISE EXCEPTION 'U6B.0218 prerequisites are missing';
  END IF;
  IF to_regclass('public.organization_slug_claims') IS NOT NULL
    OR to_regclass('public.organization_slug_rename_events') IS NOT NULL
  THEN
    RAISE EXCEPTION 'U6B.0218 refuses a partially pre-existing slug foundation';
  END IF;

  SELECT count(*)::integer
  INTO v_invalid_existing
  FROM public.clinic_public_directory_entries
  WHERE slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
    OR slug LIKE '%--%'
    OR slug = ANY (ARRAY[
      'account', 'admin', 'api', 'app', 'auth', 'book', 'booking', 'doctor', 'favicon',
      'health', 'help', 'join', 'legal', 'login', 'manage', 'manifest', 'patient', 'privacy',
      'register', 'robots', 'settings', 'sign-in', 'signup', 'sitemap', 'status', 'support',
      'terms', 'widget', '_next'
    ]::text[]);
  IF v_invalid_existing <> 0 THEN
    RAISE EXCEPTION 'U6B.0218 found % existing directory slug(s) outside the canonical namespace contract',
      v_invalid_existing;
  END IF;
END
$preflight$;

CREATE TABLE public.organization_slug_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  kind text NOT NULL,
  organization_id uuid NOT NULL,
  created_by_platform_user_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT organization_slug_claims_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id),
  CONSTRAINT organization_slug_claims_created_by_fkey
    FOREIGN KEY (created_by_platform_user_id) REFERENCES public.platform_users(id),
  CONSTRAINT organization_slug_claims_slug_format_check
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' AND slug NOT LIKE '%--%'),
  CONSTRAINT organization_slug_claims_slug_reserved_check
    CHECK (slug <> ALL (ARRAY[
      'account', 'admin', 'api', 'app', 'auth', 'book', 'booking', 'doctor', 'favicon',
      'health', 'help', 'join', 'legal', 'login', 'manage', 'manifest', 'patient', 'privacy',
      'register', 'robots', 'settings', 'sign-in', 'signup', 'sitemap', 'status', 'support',
      'terms', 'widget', '_next'
    ]::text[])),
  CONSTRAINT organization_slug_claims_kind_check
    CHECK (kind = ANY (ARRAY['reservation'::text, 'current'::text, 'alias'::text]))
);

CREATE UNIQUE INDEX uq_organization_slug_claims_slug
  ON public.organization_slug_claims USING btree (slug);
CREATE UNIQUE INDEX uq_organization_slug_claims_current_org
  ON public.organization_slug_claims USING btree (organization_id)
  WHERE kind = 'current';
CREATE UNIQUE INDEX uq_organization_slug_claims_reservation_org
  ON public.organization_slug_claims USING btree (organization_id)
  WHERE kind = 'reservation';
CREATE INDEX idx_organization_slug_claims_org_kind
  ON public.organization_slug_claims USING btree (organization_id, kind);

CREATE TABLE public.organization_slug_rename_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  actor_platform_user_id uuid,
  previous_slug text NOT NULL,
  next_slug text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT organization_slug_rename_events_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id),
  CONSTRAINT organization_slug_rename_events_actor_fkey
    FOREIGN KEY (actor_platform_user_id) REFERENCES public.platform_users(id),
  CONSTRAINT organization_slug_rename_events_slug_change_check
    CHECK (previous_slug <> next_slug)
);

CREATE INDEX idx_organization_slug_rename_events_org_created
  ON public.organization_slug_rename_events USING btree (organization_id, created_at DESC);

-- Adopt every already-published or draft directory slug into the new global namespace. This does
-- not change is_published and therefore never bulk-publishes an organization.
INSERT INTO public.organization_slug_claims (slug, kind, organization_id)
SELECT directory.slug, 'current', directory.organization_id
FROM public.clinic_public_directory_entries AS directory;

CREATE OR REPLACE FUNCTION app.guard_organization_slug_claim_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.kind IN ('current', 'alias') THEN
    RAISE EXCEPTION 'durable organization slug claims cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.kind = 'alias' THEN
    RAISE EXCEPTION 'organization slug aliases are immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.kind = 'current' AND (
    NEW.kind <> 'current'
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
  ) THEN
    RAISE EXCEPTION 'current organization slug target is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.kind = 'reservation' AND NEW.kind NOT IN ('reservation', 'current') THEN
    RAISE EXCEPTION 'invalid organization slug reservation transition';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION app.guard_organization_slug_claim_mutation() FROM PUBLIC;
CREATE TRIGGER organization_slug_claims_immutable_guard
  BEFORE UPDATE OR DELETE ON public.organization_slug_claims
  FOR EACH ROW EXECUTE FUNCTION app.guard_organization_slug_claim_mutation();

-- A current slug may change only inside a complete rename transaction that retains the old slug
-- as a direct organization alias and appends the immutable audit event. Deferred evaluation lets
-- the Drizzle transaction perform update -> alias insert -> audit insert, while a partial/direct
-- UPDATE fails at COMMIT.
CREATE OR REPLACE FUNCTION app.assert_organization_slug_rename_complete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_slug_claims AS alias_claim
    WHERE alias_claim.slug = OLD.slug
      AND alias_claim.kind = 'alias'
      AND alias_claim.organization_id = OLD.organization_id
  ) OR EXISTS (
    SELECT 1
    FROM public.clinic_public_directory_entries AS directory
    WHERE directory.organization_id = OLD.organization_id
      AND directory.slug <> NEW.slug
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.organization_slug_rename_events AS rename_event
    WHERE rename_event.organization_id = OLD.organization_id
      AND rename_event.previous_slug = OLD.slug
      AND rename_event.next_slug = NEW.slug
  ) THEN
    RAISE EXCEPTION 'organization slug rename requires retained alias, synchronized directory and audit event';
  END IF;
  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION app.assert_organization_slug_rename_complete() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER organization_slug_claims_rename_complete_guard
  AFTER UPDATE ON public.organization_slug_claims
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.kind = 'current' AND NEW.kind = 'current' AND OLD.slug IS DISTINCT FROM NEW.slug)
  EXECUTE FUNCTION app.assert_organization_slug_rename_complete();

CREATE OR REPLACE FUNCTION app.assert_organization_slug_alias_complete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_slug_claims AS current_claim
    INNER JOIN public.organization_slug_rename_events AS rename_event
      ON rename_event.organization_id = current_claim.organization_id
      AND rename_event.previous_slug = NEW.slug
      AND rename_event.next_slug = current_claim.slug
    WHERE current_claim.organization_id = NEW.organization_id
      AND current_claim.kind = 'current'
  ) THEN
    RAISE EXCEPTION 'organization slug alias requires direct current target and audit event';
  END IF;
  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION app.assert_organization_slug_alias_complete() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER organization_slug_claims_alias_complete_guard
  AFTER INSERT ON public.organization_slug_claims
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.kind = 'alias')
  EXECUTE FUNCTION app.assert_organization_slug_alias_complete();

CREATE OR REPLACE FUNCTION app.guard_organization_slug_rename_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'organization slug rename audit is append-only';
END
$function$;

REVOKE ALL ON FUNCTION app.guard_organization_slug_rename_event_mutation() FROM PUBLIC;
CREATE TRIGGER organization_slug_rename_events_immutable_guard
  BEFORE UPDATE OR DELETE ON public.organization_slug_rename_events
  FOR EACH ROW EXECUTE FUNCTION app.guard_organization_slug_rename_event_mutation();

-- Validate aggregate-only backfill invariants before FORCE RLS hides the tables from the migrator.
DO $postflight$
DECLARE
  v_directory_count bigint;
  v_current_count bigint;
BEGIN
  SELECT count(*) INTO v_directory_count FROM public.clinic_public_directory_entries;
  SELECT count(*) INTO v_current_count
  FROM public.organization_slug_claims
  WHERE kind = 'current';
  IF v_directory_count <> v_current_count THEN
    RAISE EXCEPTION 'U6B.0218 backfill mismatch: directory %, current claims %',
      v_directory_count, v_current_count;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.organization_slug_claims AS alias_claim
    WHERE alias_claim.kind = 'alias'
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_slug_claims AS current_claim
        WHERE current_claim.organization_id = alias_claim.organization_id
          AND current_claim.kind = 'current'
      )
  ) THEN
    RAISE EXCEPTION 'U6B.0218 found alias without a direct current organization target';
  END IF;
END
$postflight$;

ALTER TABLE public.organization_slug_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_slug_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_slug_claims_exact_org_staff
  ON public.organization_slug_claims
  FOR ALL TO app_staff
  USING (organization_id = app.current_org_id())
  WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE public.organization_slug_rename_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_slug_rename_events FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_slug_rename_events_select_org_staff
  ON public.organization_slug_rename_events
  FOR SELECT TO app_staff
  USING (organization_id = app.current_org_id());
CREATE POLICY organization_slug_rename_events_insert_org_staff
  ON public.organization_slug_rename_events
  FOR INSERT TO app_staff
  WITH CHECK (organization_id = app.current_org_id());

-- Replace the legacy missing-context-open directory policy with a fail-closed exact-org staff wall.
ALTER TABLE public.clinic_public_directory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_public_directory_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_org_dormant_p0_8_3 ON public.clinic_public_directory_entries;
CREATE POLICY clinic_public_directory_entries_exact_org_staff
  ON public.clinic_public_directory_entries
  FOR ALL TO app_staff
  USING (organization_id = app.current_org_id())
  WITH CHECK (organization_id = app.current_org_id());

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    REVOKE ALL ON TABLE public.organization_slug_claims FROM app_patient;
    REVOKE ALL ON TABLE public.organization_slug_rename_events FROM app_patient;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_slug_claims TO app_staff;
    GRANT SELECT, INSERT ON TABLE public.organization_slug_rename_events TO app_staff;
    REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.organization_slug_rename_events FROM app_staff;
  END IF;
END
$grants$;

-- Safe rollback/degradation contract:
-- * application rollback leaves these dormant tables and the fail-closed directory policy intact;
-- * current/alias rows and rename audit are never dropped or reused;
-- * destructive table removal is permitted only before any non-backfill claim/event exists, by a separately
--   owner-authorized migration. Restoring the legacy missing-context-open 0205 policy is forbidden.
