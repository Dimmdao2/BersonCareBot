-- TEMPORARY LOCAL MIGRATION NUMBER 0359 — final number assigned by whoever lands this into feat
-- (AGENTS.md §1 "Миграции: временный номер в клоне").
--
-- Visibility model, stage A + B (docs/_TODO/VISIBILITY_MODEL_DESIGN_2026-08-04.md §1/§5/§6,
-- #987). Stage A is purely additive — nothing reads patient_specialist_links yet (wired in a
-- later stage, after backfill). Stage B wires be_organization_members.doctor_screens_disabled
-- into the clinical-workspace access predicate in the same commit (app-layer change, no SQL
-- here beyond the column itself).

-- ── Stage A.1: patient_specialist_links ────────────────────────────────────────────────────────
-- Same structural shape as the neighboring org_enrollments/organization_member_invites tables
-- (FK style, cascade behavior, dormant P0.8.3-style RLS) — not a new idiom.
CREATE TABLE IF NOT EXISTS patient_specialist_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  patient_user_id uuid NOT NULL,
  specialist_id uuid NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  created_via text NOT NULL,
  source_link_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  ended_at timestamptz,
  ended_reason text,
  CONSTRAINT patient_specialist_links_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE,
  CONSTRAINT patient_specialist_links_patient_user_id_fkey
    FOREIGN KEY (patient_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  CONSTRAINT patient_specialist_links_specialist_id_fkey
    FOREIGN KEY (specialist_id) REFERENCES be_specialists(id) ON DELETE CASCADE,
  CONSTRAINT patient_specialist_links_source_link_id_fkey
    FOREIGN KEY (source_link_id) REFERENCES patient_specialist_links(id) ON DELETE SET NULL,
  CONSTRAINT patient_specialist_links_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'ended'::text])),
  CONSTRAINT patient_specialist_links_created_via_check
    CHECK (created_via = ANY (ARRAY['first_appointment'::text, 'manual_assign'::text, 'transfer'::text])),
  CONSTRAINT patient_specialist_links_ended_reason_check
    CHECK (ended_reason IS NULL OR ended_reason = ANY (ARRAY['transferred_out'::text, 'manual_remove'::text]))
);

CREATE INDEX IF NOT EXISTS idx_patient_specialist_links_org
  ON patient_specialist_links USING btree (organization_id);

CREATE INDEX IF NOT EXISTS idx_patient_specialist_links_patient
  ON patient_specialist_links USING btree (patient_user_id);

CREATE INDEX IF NOT EXISTS idx_patient_specialist_links_specialist
  ON patient_specialist_links USING btree (specialist_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_specialist_links_active_pair
  ON patient_specialist_links USING btree (patient_user_id, specialist_id)
  WHERE status = 'active';

-- Dormant baseline wall, same shape as org_enrollments/organization_member_invites
-- (docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-3-policy-targets.mjs — direct_org_column, no patient
-- ownership on this row shape).
ALTER TABLE "public"."patient_specialist_links" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."patient_specialist_links";
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_specialist_links" FOR ALL USING ((app.current_org_id() IS NULL OR "organization_id" = app.current_org_id())) WITH CHECK ((app.current_org_id() IS NULL OR "organization_id" = app.current_org_id()));

-- ── Stage B: doctor_screens_disabled ────────────────────────────────────────────────────────────
-- Personal, not org-wide (owner: "отключить У СЕБЯ в кабинете") — a column on the membership row,
-- not a new org_settings table. Fills the field that already exists in the TS access-context type
-- (workspaceCapabilities.ts `canAccessClinicalWorkspace`) but that nothing populates today.
ALTER TABLE be_organization_members
  ADD COLUMN IF NOT EXISTS doctor_screens_disabled boolean DEFAULT false NOT NULL;

-- app.list_platform_organization_members (0267) is the one SECURITY DEFINER projection of
-- be_organization_members read outside this table's own drizzle port; it must carry the new
-- column too so the platform directory type stays truthful. Postgres refuses to change an
-- existing function's RETURNS TABLE column list via CREATE OR REPLACE ("cannot change return
-- type of existing function") — DROP + CREATE, then re-apply 0267's owner/ACL/comment wall.
SET ROLE app_owner;

DROP FUNCTION IF EXISTS app.list_platform_organization_members(uuid);

CREATE FUNCTION app.list_platform_organization_members(
  p_organization_id uuid
)
RETURNS TABLE (
  membership_id uuid,
  organization_id uuid,
  platform_user_id uuid,
  membership_role text,
  specialist_id uuid,
  membership_status text,
  doctor_screens_disabled boolean,
  created_at timestamptz,
  updated_at timestamptz,
  display_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    membership.id,
    membership.organization_id,
    membership.platform_user_id,
    membership.role,
    membership.specialist_id,
    membership.status,
    membership.doctor_screens_disabled,
    membership.created_at,
    membership.updated_at,
    NULLIF(btrim(platform_user.display_name), '')
  FROM public.be_organization_members AS membership
  INNER JOIN public.platform_users AS platform_user
    ON platform_user.id = membership.platform_user_id
  WHERE membership.organization_id = p_organization_id
  ORDER BY membership.created_at, membership.platform_user_id
$function$;

RESET ROLE;

ALTER FUNCTION app.list_platform_organization_members(uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.list_platform_organization_members(uuid)
  FROM PUBLIC, app_staff, app_patient, app_platform_settings;

COMMENT ON FUNCTION app.list_platform_organization_members(uuid) IS
  'Platform-only staff directory projection: display name and membership metadata for one exact organization; no contacts or patient data.';

-- Rollback, if this migration has not been used by application code yet:
--   ALTER TABLE be_organization_members DROP COLUMN IF EXISTS doctor_screens_disabled;
--   DROP TABLE IF EXISTS patient_specialist_links;
--   (re-apply 0267's original app.list_platform_organization_members body to drop the column)
