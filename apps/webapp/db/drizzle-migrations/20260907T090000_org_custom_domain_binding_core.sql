-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.org_custom_domain_bindings') IS NOT NULL AND to_regprocedure('app.resolve_active_organization_by_custom_domain(text)') IS NOT NULL AND to_regprocedure('app.read_anonymous_patient_surface_projection(uuid)') IS NOT NULL AND to_regprocedure('app.custom_domain_ask_is_authorized(text)') IS NOT NULL AND to_regprocedure('app.custom_domain_apply_transition(text,text,text)') IS NOT NULL
--
-- B2/B8/C5a (reopened #787, docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md):
-- server-owned custom-domain binding lifecycle. `public.org_custom_domain_bindings` itself is a
-- plain organization-scoped table (RLS clinic wall, declared in
-- deploy/postgres/privileges/declaration.ts) written by `app_staff` through ordinary Drizzle
-- transactions — the same pattern `organization_slug_claims` already uses
-- (apps/webapp/src/infra/repos/pgClinicDirectory.ts). No DEFINER wrapper is needed for that path.
--
-- Four narrow SECURITY DEFINER doors, all owned by the new `app_seam_custom_domain_owner` seam
-- (never combined with `app_seam_public_slug_owner`/`app_seam_public_clinic_card_owner` — a
-- separate seam owner per README §Границы, so this door cannot widen an unrelated seam's reach):
--
--   1. `resolve_active_organization_by_custom_domain(text)` — pre-session hostname -> organization
--      id, reachable before any principal exists, exactly like
--      `app.resolve_public_organization_by_slug` (deploy/postgres/public-clinic-slug-bootstrap-resolver.sql)
--      is for the `<slug>.therapygo.ru` path. Only `status = 'active'` and an active organization
--      ever match; pending/failed/suspended/quarantine rows are invisible to Host resolution by
--      construction of the WHERE clause, not by caller discipline (B2).
--   2. `read_anonymous_patient_surface_projection(uuid)` — the anonymous-safe brand projection for
--      an ALREADY-resolved organization id (used by both the slug path and the custom-domain path).
--      `app.read_org_brand_core_context` (0238) cannot be reused here: it requires a staff-of-org or
--      enrolled-patient principal and returns zero rows for a bootstrap session
--      (apps/webapp/src/infra/repos/pgOrgBranding.ts). A clinic with no published brand still
--      resolves — `effective_display_name`/`patient_app_name` fall back to the core organization
--      title — which is exactly B4a's "known clinic without paid branding remains a live surface"
--      requirement. KNOWN SIMPLIFICATION (documented, not silently claimed complete): this reads
--      `org_brand_revisions.status = 'published'` directly and does not re-check the organization's
--      current `branding` mechanic entitlement on every anonymous read the way
--      `app.resolve_organization_mechanic_access` does for principled sessions — publishing already
--      goes through that entitlement gate once, but a later tariff downgrade does not retroactively
--      unpublish a revision here. A follow-up reconciliation job (out of scope for #787) should
--      unpublish on downgrade if the owner wants that closed exactly.
--   3. `custom_domain_ask_is_authorized(text)` — the ONLY question a Caddy `on_demand_tls` `ask`
--      endpoint needs answered: "are we willing to request a certificate for this hostname at all".
--      It deliberately does NOT probe DNS or claim a certificate exists — that is exactly the "do not
--      claim a certificate exists from DNS alone" boundary from the reopening ruling. `pending` is
--      authorized on purpose: the very first issuance attempt happens while the clinic is still
--      pointing DNS at us.
--   4. `custom_domain_apply_transition(text,text,text)` — the narrow, deterministic
--      pending/dns_ready/active/failed/suspended transition door for a LATER verifier/edge
--      integration (not built in this slice). It never runs on its own; nothing in this migration
--      calls it automatically.
--
-- Both infra doors (3, 4) run under `app_worker`/`contextClass: service`, the SAME generic
-- infra-principal role every other `/api/internal/**` tick route already runs its named roots under
-- (deploy/postgres/privileges/declaration.ts `WEBAPP_WORKER_SOURCES`) — no new infra role.

CREATE TABLE "org_custom_domain_bindings" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid,
  "base_domain" text NOT NULL,
  "placement" text NOT NULL DEFAULT 'apex',
  "subdomain_label" text,
  "hostname" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "status_reason" text,
  "created_by_platform_user_id" uuid,
  "activated_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "org_custom_domain_bindings_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."be_organizations"("id") ON DELETE SET NULL,
  CONSTRAINT "org_custom_domain_bindings_created_by_fkey"
    FOREIGN KEY ("created_by_platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE SET NULL,
  CONSTRAINT "org_custom_domain_bindings_placement_check"
    CHECK ("placement" = ANY (ARRAY['apex'::text, 'subdomain'::text])),
  CONSTRAINT "org_custom_domain_bindings_status_check"
    CHECK ("status" = ANY (ARRAY['pending'::text, 'dns_ready'::text, 'active'::text, 'failed'::text, 'suspended'::text, 'quarantine'::text])),
  CONSTRAINT "org_custom_domain_bindings_subdomain_label_presence_check"
    CHECK (("placement" = 'apex' AND "subdomain_label" IS NULL)
      OR ("placement" = 'subdomain' AND "subdomain_label" IS NOT NULL)),
  CONSTRAINT "org_custom_domain_bindings_lower_check"
    CHECK ("base_domain" = lower("base_domain") AND "hostname" = lower("hostname")
      AND ("subdomain_label" IS NULL OR "subdomain_label" = lower("subdomain_label"))),
  CONSTRAINT "org_custom_domain_bindings_base_domain_format_check"
    CHECK ("base_domain" ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
      AND length("base_domain") <= 253),
  CONSTRAINT "org_custom_domain_bindings_subdomain_label_format_check"
    CHECK ("subdomain_label" IS NULL OR "subdomain_label" ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  CONSTRAINT "org_custom_domain_bindings_hostname_matches_placement_check"
    CHECK ("hostname" = CASE WHEN "placement" = 'apex' THEN "base_domain"
      ELSE "subdomain_label" || '.' || "base_domain" END)
);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner

CREATE UNIQUE INDEX "uq_org_custom_domain_bindings_hostname"
  ON "org_custom_domain_bindings" USING btree (lower("hostname"));
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner

CREATE UNIQUE INDEX "uq_org_custom_domain_bindings_live_org"
  ON "org_custom_domain_bindings" USING btree ("organization_id")
  WHERE "organization_id" IS NOT NULL AND "status" <> 'quarantine';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner

CREATE INDEX "idx_org_custom_domain_bindings_status"
  ON "org_custom_domain_bindings" USING btree ("status");
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner

CREATE FUNCTION app.resolve_active_organization_by_custom_domain(p_hostname text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT binding.organization_id
  FROM public.org_custom_domain_bindings AS binding
  INNER JOIN public.be_organizations AS organization
    ON organization.id = binding.organization_id
    AND organization.is_active = true
  WHERE binding.hostname = lower(btrim(p_hostname))
    AND binding.status = 'active'
  LIMIT 1
$$;

COMMENT ON FUNCTION app.resolve_active_organization_by_custom_domain(text) IS
  'Pre-session hostname -> organization id for an ACTIVE custom-domain binding of an active organization only (B2).';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner

CREATE FUNCTION app.read_anonymous_patient_surface_projection(p_organization_id uuid)
RETURNS TABLE (
  clinic_slug text,
  skip_public_card_at_root boolean,
  effective_display_name text,
  patient_app_name text,
  accent_token text,
  logo_url text,
  active_custom_domain_hostname text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    directory.slug,
    COALESCE((skip_setting.value_json ->> 'value')::boolean, false),
    COALESCE(brand.display_name, organization.title),
    COALESCE(brand.patient_app_name, brand.display_name, organization.title),
    COALESCE(brand.accent_token, '#284da0'),
    CASE WHEN logo.id IS NOT NULL THEN '/api/media/' || brand.logo_media_id::text ELSE NULL END,
    active_binding.hostname
  FROM public.be_organizations AS organization
  INNER JOIN public.clinic_public_directory_entries AS directory
    ON directory.organization_id = organization.id
    AND directory.is_published = true
  LEFT JOIN public.org_brand_revisions AS brand
    ON brand.organization_id = organization.id
    AND brand.status = 'published'
  LEFT JOIN public.media_files AS logo
    ON logo.id = brand.logo_media_id
    AND logo.owner_kind = 'organization'
    AND logo.organization_id = organization.id
    AND logo.status = 'ready'
    AND logo.mime_type LIKE 'image/%'
  LEFT JOIN public.system_settings AS skip_setting
    ON skip_setting.key = 'clinic_root_skip_public_card'
    AND skip_setting.scope = 'per_org'
    AND skip_setting.organization_id = organization.id
  LEFT JOIN public.org_custom_domain_bindings AS active_binding
    ON active_binding.organization_id = organization.id
    AND active_binding.status = 'active'
  WHERE organization.id = p_organization_id
    AND organization.is_active = true
  LIMIT 1
$$;

COMMENT ON FUNCTION app.read_anonymous_patient_surface_projection(uuid) IS
  'Anonymous-safe brand/slug/redirect projection for an already-resolved organization id (B4a/B2). No row for an unknown, inactive, or unpublished-slug organization.';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner

CREATE FUNCTION app.custom_domain_ask_is_authorized(p_hostname text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_custom_domain_bindings
    WHERE hostname = lower(btrim(p_hostname))
      AND status IN ('pending', 'dns_ready', 'active')
  )
$$;

COMMENT ON FUNCTION app.custom_domain_ask_is_authorized(text) IS
  'Caddy on_demand_tls ask authorization only: is this hostname one we are willing to request a certificate for. Never probes DNS and never claims a certificate exists (C5a).';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

CREATE FUNCTION app.custom_domain_apply_transition(p_hostname text, p_transition text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_current text;
BEGIN
  SELECT status INTO v_current
  FROM public.org_custom_domain_bindings
  WHERE hostname = lower(btrim(p_hostname))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF NOT (
    (p_transition = 'mark_dns_ready' AND v_current = 'pending')
    OR (p_transition = 'mark_active' AND v_current IN ('dns_ready', 'suspended'))
    OR (p_transition = 'mark_failed' AND v_current IN ('pending', 'dns_ready'))
    OR (p_transition = 'mark_suspended' AND v_current = 'active')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_transition');
  END IF;

  UPDATE public.org_custom_domain_bindings
  SET status = CASE p_transition
      WHEN 'mark_dns_ready' THEN 'dns_ready'
      WHEN 'mark_active' THEN 'active'
      WHEN 'mark_failed' THEN 'failed'
      WHEN 'mark_suspended' THEN 'suspended'
    END,
    status_reason = p_reason,
    activated_at = CASE WHEN p_transition = 'mark_active' THEN now() ELSE activated_at END,
    updated_at = now()
  WHERE hostname = lower(btrim(p_hostname));

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION app.custom_domain_apply_transition(text, text, text) IS
  'Deterministic pending/dns_ready/active/failed/suspended transition door for a later verifier/edge integration (C5a). Never called automatically by this migration; DNS alone never reaches mark_active through this door either — the caller must supply that assurance.';
