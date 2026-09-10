-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_anonymous_patient_surface_projection(uuid)
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'skip_setting.scope = ''admin''') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.read_anonymous_patient_surface_projection(uuid)')
-- The settings UI persists clinic_root_skip_public_card in the existing admin organization scope.
-- Reuse the existing anonymous projection and its owner; only the row discriminator changes.
-- Rights analysis: the SECURITY DEFINER owner still reads the same public.system_settings columns
-- and all other relations are unchanged, so no declaration or privilege change is required.

CREATE OR REPLACE FUNCTION app.read_anonymous_patient_surface_projection(p_organization_id uuid)
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
    AND skip_setting.scope = 'admin'
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
