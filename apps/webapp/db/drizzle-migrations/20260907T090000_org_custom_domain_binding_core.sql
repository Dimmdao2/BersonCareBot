-- BCB-MIGRATION-OWNER: app_object_owner
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
-- Four narrow custom-domain SECURITY DEFINER doors are owned by `app_seam_custom_domain_owner`
-- (never combined with `app_seam_public_slug_owner`/`app_seam_public_clinic_card_owner` — a
-- separate seam owner per README §Границы, so this door cannot widen an unrelated seam's reach):
--
--   1. `resolve_active_organization_by_custom_domain(text)` — pre-session hostname -> organization
--      id, reachable before any principal exists, exactly like
--      `app.resolve_public_organization_by_slug` (deploy/postgres/public-clinic-slug-bootstrap-resolver.sql)
--      is for the `<slug>.therapygo.ru` path. Only `status = 'active'` and an active organization
--      ever match; pending/failed/suspended/quarantine rows are invisible to Host resolution by
--      construction of the WHERE clause, not by caller discipline (B2). The application then
--      applies the current shared `custom_domain` entitlement decision.
--   2. `read_anonymous_patient_surface_projection(uuid)` — the anonymous-safe brand projection for
--      an ALREADY-resolved organization id (used by both the slug path and the custom-domain path).
--      `app.read_org_brand_core_context` (0238) cannot be reused here: it requires a staff-of-org or
--      enrolled-patient principal and returns zero rows for a bootstrap session
--      (apps/webapp/src/infra/repos/pgOrgBranding.ts). A clinic with no published brand still
--      resolves — `effective_display_name`/`patient_app_name` fall back to the core organization
--      title — which is exactly B4a's "known clinic without paid branding remains a live surface"
--      requirement. An active custom hostname is projected only with a published brand, and the
--      application applies the current shared `custom_domain` entitlement before redirect/use.
--   3. `custom_domain_ask_is_authorized(text)` — the ONLY question a Caddy `on_demand_tls` `ask`
--      endpoint needs answered: "are we willing to request a certificate for this hostname at all".
--      It deliberately does NOT probe DNS or claim a certificate exists. Pending and eligible
--      retries are authorized because the trusted handshake triggers approved Caddy issuance.
--   4. `custom_domain_apply_transition(text,text,text)` — the narrow deterministic lifecycle door.
--      Its only application caller is the shared verifier after ordered DNS, trusted TLS and exact
--      edge->nginx->webapp proof.
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
-- BCB-MIGRATION-OWNER: app_object_owner

CREATE UNIQUE INDEX "uq_org_custom_domain_bindings_hostname"
  ON "org_custom_domain_bindings" USING btree (lower("hostname"));
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

CREATE UNIQUE INDEX "uq_org_custom_domain_bindings_live_org"
  ON "org_custom_domain_bindings" USING btree ("organization_id")
  WHERE "organization_id" IS NOT NULL AND "status" <> 'quarantine';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

CREATE INDEX "idx_org_custom_domain_bindings_status"
  ON "org_custom_domain_bindings" USING btree ("status");
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

-- Move the legacy setting once into the canonical store. `app.<base>` is the only subdomain form;
-- every other valid hostname is an apex. Invalid, platform-owned or conflicting rows abort visibly.
DO $migration$
DECLARE
  legacy record;
  normalized_hostname text;
  derived_base_domain text;
  derived_placement text;
BEGIN
  FOR legacy IN
    SELECT setting.organization_id, setting.value_json ->> 'value' AS hostname
    FROM public.system_settings AS setting
    WHERE setting.key = 'org_custom_domain_hostname'
      AND setting.scope = 'admin'
      AND setting.organization_id IS NOT NULL
      AND jsonb_typeof(setting.value_json -> 'value') = 'string'
      AND btrim(setting.value_json ->> 'value') <> ''
    ORDER BY setting.organization_id
  LOOP
    normalized_hostname := lower(btrim(legacy.hostname));
    IF normalized_hostname !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
      OR length(normalized_hostname) > 253
      OR normalized_hostname = 'therapygo.ru'
      OR normalized_hostname LIKE '%.therapygo.ru'
      OR normalized_hostname = 'therapysto.ru'
      OR normalized_hostname LIKE '%.therapysto.ru'
    THEN
      RAISE EXCEPTION 'legacy custom domain is invalid or platform-owned for organization %',
        legacy.organization_id;
    END IF;

    IF normalized_hostname LIKE 'app.%' THEN
      derived_placement := 'subdomain';
      derived_base_domain := substring(normalized_hostname FROM 5);
    ELSE
      derived_placement := 'apex';
      derived_base_domain := normalized_hostname;
    END IF;

    INSERT INTO public.org_custom_domain_bindings (
      organization_id, base_domain, placement, subdomain_label, hostname, status, status_reason
    ) VALUES (
      legacy.organization_id,
      derived_base_domain,
      derived_placement,
      CASE WHEN derived_placement = 'subdomain' THEN 'app' ELSE NULL END,
      normalized_hostname,
      'pending',
      'migrated_from_legacy_setting_requires_verification'
    );
  END LOOP;

  DELETE FROM public.system_settings
  WHERE key = 'org_custom_domain_hostname'
    AND scope = 'admin'
    AND organization_id IS NOT NULL;
END
$migration$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner

DROP INDEX IF EXISTS public.system_settings_org_custom_domain_hostname_uidx;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.list_configured_custom_domain_hostnames()

-- Parameterize the existing scheduler root to return canonical lifecycle targets. Its identity,
-- purpose and scheduled caller remain unchanged; no second monitor or settings store is created.
CREATE OR REPLACE FUNCTION app.list_configured_custom_domain_hostnames()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER PARALLEL RESTRICTED
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  targets jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_runtime_owner'::name,
    'app_worker'::name,
    'service'::app.port_context_class,
    'health.custom-domain.list',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.list_configured_custom_domain_hostnames()'::regprocedure
  );

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'organizationId', binding.organization_id::text,
        'baseDomain', binding.base_domain,
        'placement', binding.placement,
        'hostname', binding.hostname,
        'status', binding.status,
        'organizationActive', COALESCE(organization.is_active, false),
        'hasPublishedBrand', EXISTS (
          SELECT 1 FROM public.org_brand_revisions AS brand
          WHERE brand.organization_id = binding.organization_id
            AND brand.status = 'published'
        )
      ) ORDER BY binding.hostname
    ),
    '[]'::jsonb
  ) INTO targets
  FROM public.org_custom_domain_bindings AS binding
  LEFT JOIN public.be_organizations AS organization ON organization.id = binding.organization_id
  WHERE binding.organization_id IS NOT NULL
    AND binding.status <> 'quarantine';

  RETURN targets;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

CREATE FUNCTION app.resolve_active_organization_by_custom_domain(p_hostname text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RETURN (
    SELECT binding.organization_id
    FROM public.org_custom_domain_bindings AS binding
    INNER JOIN public.be_organizations AS organization
      ON organization.id = binding.organization_id
      AND organization.is_active = true
    INNER JOIN public.org_brand_revisions AS brand
      ON brand.organization_id = binding.organization_id
      AND brand.status = 'published'
    WHERE binding.hostname = lower(btrim(p_hostname))
      AND binding.status = 'active'
    LIMIT 1
  );
END
$$;

COMMENT ON FUNCTION app.resolve_active_organization_by_custom_domain(text) IS
  'Pre-session hostname -> organization id for an ACTIVE custom-domain binding of an active organization only (B2).';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

CREATE FUNCTION app.read_anonymous_patient_surface_projection(p_organization_id uuid)
RETURNS TABLE (
  clinic_slug text,
  skip_public_card_at_root boolean,
  effective_display_name text,
  patient_app_name text,
  accent_token text,
  logo_url text,
  active_custom_domain_hostname text,
  clinic_messenger_bots jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RETURN QUERY SELECT
    directory.slug,
    COALESCE((skip_setting.value_json ->> 'value')::boolean, false),
    COALESCE(brand.display_name, organization.title),
    COALESCE(brand.patient_app_name, brand.display_name, organization.title),
    COALESCE(brand.accent_token, '#284da0'),
    CASE WHEN logo.id IS NOT NULL THEN '/api/media/' || brand.logo_media_id::text ELSE NULL END,
    active_binding.hostname,
    jsonb_strip_nulls(jsonb_build_object(
      'telegram', CASE WHEN telegram_bot.key IS NULL THEN NULL
        WHEN telegram_bot.value_json #>> '{deliveryReadiness,status}' = 'enabled'
          AND telegram_bot.value_json ->> 'botPublicId' ~ '^[A-Za-z0-9_]{3,64}$'
        THEN jsonb_build_object('status', 'ready', 'publicId', telegram_bot.value_json ->> 'botPublicId')
        ELSE jsonb_build_object('status', 'declared_invalid') END,
      'max', CASE WHEN max_bot.key IS NULL THEN NULL
        WHEN max_bot.value_json #>> '{deliveryReadiness,status}' = 'enabled'
          AND max_bot.value_json ->> 'botPublicId' ~ '^[A-Za-z0-9_]{3,64}$'
        THEN jsonb_build_object('status', 'ready', 'publicId', max_bot.value_json ->> 'botPublicId')
        ELSE jsonb_build_object('status', 'declared_invalid') END
    ))
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
    AND brand.id IS NOT NULL
  LEFT JOIN public.system_settings AS telegram_bot
    ON telegram_bot.key = 'clinic_telegram_bot_token'
    AND telegram_bot.scope = 'admin'
    AND telegram_bot.organization_id = organization.id
  LEFT JOIN public.system_settings AS max_bot
    ON max_bot.key = 'clinic_max_bot_api_key'
    AND max_bot.scope = 'admin'
    AND max_bot.organization_id = organization.id
  WHERE organization.id = p_organization_id
    AND organization.is_active = true
  LIMIT 1;
END
$$;

COMMENT ON FUNCTION app.read_anonymous_patient_surface_projection(uuid) IS
  'Anonymous-safe brand/slug/redirect projection for an already-resolved organization id (B4a/B2). No row for an unknown, inactive, or unpublished-slug organization.';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql

CREATE FUNCTION app.custom_domain_ask_is_authorized(p_hostname text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.org_custom_domain_bindings AS binding
    INNER JOIN public.be_organizations AS organization
      ON organization.id = binding.organization_id
      AND organization.is_active = true
    INNER JOIN public.org_brand_revisions AS brand
      ON brand.organization_id = binding.organization_id
      AND brand.status = 'published'
    WHERE binding.hostname = lower(btrim(p_hostname))
      AND binding.status IN ('pending', 'dns_ready', 'active', 'suspended')
  );
END
$$;

COMMENT ON FUNCTION app.custom_domain_ask_is_authorized(text) IS
  'Caddy on_demand_tls ask authorization only: is this hostname one we are willing to request a certificate for. Never probes DNS and never claims a certificate exists (C5a).';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
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
  v_eligible boolean;
BEGIN
  SELECT binding.status,
    organization.is_active AND EXISTS (
      SELECT 1 FROM public.org_brand_revisions AS brand
      WHERE brand.organization_id = binding.organization_id
        AND brand.status = 'published'
    )
  INTO v_current, v_eligible
  FROM public.org_custom_domain_bindings AS binding
  INNER JOIN public.be_organizations AS organization ON organization.id = binding.organization_id
  WHERE binding.hostname = lower(btrim(p_hostname))
  FOR UPDATE OF binding;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF (p_transition IN ('mark_dns_ready', 'mark_active') AND NOT v_eligible)
    OR NOT (
    (p_transition = 'mark_dns_ready' AND v_current IN ('pending', 'failed', 'suspended', 'dns_ready'))
    OR (p_transition = 'mark_active' AND v_current IN ('dns_ready', 'active'))
    OR (p_transition = 'mark_failed' AND v_current <> 'quarantine')
    OR (p_transition = 'mark_suspended' AND v_current <> 'quarantine')
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
  'Lifecycle transition door called only by the shared DNS -> trusted TLS -> exact routing verifier (C5a).';
