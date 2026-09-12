-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_anonymous_patient_surface_projection(uuid)
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_function_result('app.read_anonymous_patient_surface_projection(uuid)'::pg_catalog.regprocedure) NOT LIKE '%skip_public_card_at_root%' AND NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'clinic_root_skip_public_card')
--
-- Владелец 12.09.2026, дословно: «app clinic ru не должен вести на публичную карточку клиники. Он
-- должен в любом случае открывать логин всегда. Публичная карточка клиники как была, так и остаётся
-- на поддомене therapygo.ru» и «Однозначно убирать поведение, которое сейчас есть. Да и checkbox
-- тоже однозначно убирать».
--
-- ЧТО БЫЛО. Брендированный корень выбирал между визиткой и входом по настройке организации
-- `clinic_root_skip_public_card`. Выбор стоял на организации, а не на адресе, поэтому собственный
-- домен клиники по умолчанию открывал её визитку, а не её приложение.
--
-- ЧТО СТАЛО. Корень решает АДРЕС, с которого пришли, и решает его код (`patientTreeRewritePath`),
-- а не строка в настройках: собственный домен клиники — приложение, платформенный поддомен
-- `<slug>.<пациентский хост>` — визитка. Различить их можно уже сейчас и без новых данных: у
-- организации в проекции есть `active_custom_domain_hostname`, и резолвер сравнивает его с хостом
-- запроса (тот же единственный факт, по которому ставится 308-редирект B2/B8).
--
-- Поэтому настройке в проекции делать нечего, и сама она не нужна ни одному другому читателю:
-- кроме снятой ветки корня, ключ не читал никто. Строки ключа удаляются здесь же — с ним ушёл и
-- реестровый ключ, а без реестра `updateSetting` их больше не перезапишет и не прочитает: остались
-- бы мёртвые строки, которые молча переживают своё назначение.
--
-- Права: список читаемых отношений и колонок у двери СОКРАЩАЕТСЯ (уходит один LEFT JOIN к
-- public.system_settings из четырёх — остальные три читают ключи ботов), владелец и роли исполнения
-- те же. Ни declaration.ts, ни гранты не меняются. DROP + CREATE, а не CREATE OR REPLACE:
-- PostgreSQL не меняет тип возврата RETURNS TABLE заменой.
DROP FUNCTION app.read_anonymous_patient_surface_projection(uuid);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.read_anonymous_patient_surface_projection(p_organization_id uuid)
RETURNS TABLE (
  clinic_slug text,
  effective_display_name text,
  patient_app_name text,
  accent_token text,
  logo_url text,
  app_icon_media_id uuid,
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
    COALESCE(brand.display_name, organization.title),
    COALESCE(brand.patient_app_name, brand.display_name, organization.title),
    COALESCE(brand.accent_token, '#284da0'),
    CASE WHEN logo.id IS NOT NULL THEN '/api/media/' || brand.logo_media_id::text ELSE NULL END,
    app_icon.id,
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
  LEFT JOIN public.media_files AS app_icon
    ON app_icon.id = brand.app_icon_media_id
    AND app_icon.owner_kind = 'organization'
    AND app_icon.organization_id = organization.id
    AND app_icon.status = 'ready'
    AND app_icon.mime_type LIKE 'image/%'
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
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner
COMMENT ON FUNCTION app.read_anonymous_patient_surface_projection(uuid) IS
  'Anonymous-safe brand/slug/redirect projection for an already-resolved organization id (B4a/B2). No row for an unknown, inactive, or unpublished-slug organization. The branded root is chosen by the arrival hostname, not by a setting (owner 2026-09-12).';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DELETE FROM public.system_settings WHERE key = 'clinic_root_skip_public_card';
