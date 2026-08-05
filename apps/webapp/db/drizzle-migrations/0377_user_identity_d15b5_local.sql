-- 0377: D15b/5 slice 1 — public.user_identity (FIO rehearsal table, dual-write phase).
-- TEMPORARY LOCAL MIGRATION NUMBER 0377 (AGENTS.md "Миграции") — lead renumbers at land.
--
-- Authority: WORK_ORDER.md D15b/5. Five identity columns: first_name, last_name, patronymic,
-- display_name, birth_date. platform_users.id remains the account key; FKs elsewhere untouched.
-- Backfill + RLS mirror platform_users (D15b/4); readers/writers cut over in follow-up slices.

CREATE TABLE IF NOT EXISTS public.user_identity (
  platform_user_id uuid PRIMARY KEY
    REFERENCES public.platform_users (id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  patronymic text,
  display_name text NOT NULL DEFAULT '',
  birth_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_identity_birth_date
  ON public.user_identity (birth_date)
  WHERE birth_date IS NOT NULL;

INSERT INTO public.user_identity (
  platform_user_id,
  first_name,
  last_name,
  patronymic,
  display_name,
  birth_date,
  created_at,
  updated_at
)
SELECT
  pu.id,
  pu.first_name,
  pu.last_name,
  pu.patronymic,
  COALESCE(pu.display_name, ''),
  pu.birth_date,
  pu.created_at,
  pu.updated_at
FROM public.platform_users pu
WHERE pu.merged_into_id IS NULL
ON CONFLICT (platform_user_id) DO NOTHING;

ALTER TABLE public.user_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_identity FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_identity_self_select ON public.user_identity;
CREATE POLICY user_identity_self_select ON public.user_identity
  FOR SELECT TO app_patient
  USING (
    app.current_patient_user_id() IS NOT NULL
    AND platform_user_id = app.current_patient_user_id()
  );

DROP POLICY IF EXISTS user_identity_self_update ON public.user_identity;
CREATE POLICY user_identity_self_update ON public.user_identity
  FOR UPDATE TO app_patient
  USING (
    app.current_patient_user_id() IS NOT NULL
    AND platform_user_id = app.current_patient_user_id()
  )
  WITH CHECK (
    app.current_patient_user_id() IS NOT NULL
    AND platform_user_id = app.current_patient_user_id()
  );

DROP POLICY IF EXISTS user_identity_staff_org_select ON public.user_identity;
CREATE POLICY user_identity_staff_org_select ON public.user_identity
  FOR SELECT TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.org_enrollments oe
        WHERE oe.platform_user_id = user_identity.platform_user_id
          AND oe.organization_id = app.current_org_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.be_organization_members bom
        WHERE bom.platform_user_id = user_identity.platform_user_id
          AND bom.organization_id = app.current_org_id()
      )
    )
  );

DROP POLICY IF EXISTS user_identity_staff_org_update ON public.user_identity;
CREATE POLICY user_identity_staff_org_update ON public.user_identity
  FOR UPDATE TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.org_enrollments oe
        WHERE oe.platform_user_id = user_identity.platform_user_id
          AND oe.organization_id = app.current_org_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.be_organization_members bom
        WHERE bom.platform_user_id = user_identity.platform_user_id
          AND bom.organization_id = app.current_org_id()
      )
    )
  )
  WITH CHECK (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.org_enrollments oe
        WHERE oe.platform_user_id = user_identity.platform_user_id
          AND oe.organization_id = app.current_org_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.be_organization_members bom
        WHERE bom.platform_user_id = user_identity.platform_user_id
          AND bom.organization_id = app.current_org_id()
      )
    )
  );

DROP POLICY IF EXISTS user_identity_staff_org_delete ON public.user_identity;
CREATE POLICY user_identity_staff_org_delete ON public.user_identity
  FOR DELETE TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.org_enrollments oe
        WHERE oe.platform_user_id = user_identity.platform_user_id
          AND oe.organization_id = app.current_org_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.be_organization_members bom
        WHERE bom.platform_user_id = user_identity.platform_user_id
          AND bom.organization_id = app.current_org_id()
      )
    )
  );

DROP POLICY IF EXISTS user_identity_staff_insert ON public.user_identity;
CREATE POLICY user_identity_staff_insert ON public.user_identity
  FOR INSERT TO app_staff
  WITH CHECK (app.is_staff());

DROP POLICY IF EXISTS user_identity_identity_bootstrap_select ON public.user_identity;
CREATE POLICY user_identity_identity_bootstrap_select ON public.user_identity
  FOR SELECT
  USING (pg_has_role(current_user, 'app_identity_bootstrap', 'member'));

DROP POLICY IF EXISTS user_identity_identity_bootstrap_insert ON public.user_identity;
CREATE POLICY user_identity_identity_bootstrap_insert ON public.user_identity
  FOR INSERT
  WITH CHECK (pg_has_role(current_user, 'app_identity_bootstrap', 'member'));

DROP POLICY IF EXISTS user_identity_identity_bootstrap_update ON public.user_identity;
CREATE POLICY user_identity_identity_bootstrap_update ON public.user_identity
  FOR UPDATE
  USING (pg_has_role(current_user, 'app_identity_bootstrap', 'member'))
  WITH CHECK (pg_has_role(current_user, 'app_identity_bootstrap', 'member'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_identity TO app_staff;
GRANT SELECT ON TABLE public.user_identity TO app_patient;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_identity TO app_identity_bootstrap;
