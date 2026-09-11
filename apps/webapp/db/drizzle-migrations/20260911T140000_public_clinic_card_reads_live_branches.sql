-- BCB-MIGRATION-OWNER: app_seam_public_clinic_card_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_get_functiondef(to_regprocedure('app.read_public_clinic_card(text)')) NOT LIKE '%entry.locations_json%'
--
-- #926 §17.A. `locations_json` на `clinic_public_directory_entries` — снимок филиалов, взятый ТОЛЬКО
-- внутри `app.save_public_clinic_card` в момент, когда клиника последний раз сохраняла форму
-- карточки. Клиника добавляет, переименовывает, переносит или закрывает филиал позже — снимок не
-- шелохнётся, визитка показывает то, чего уже нет. Замерено 11.09 живьём: у организации с тремя
-- активными филиалами `locations_json` был `[]`, потому что форму никто не сохранял.
--
-- Снимок снят вовсе — вместо второго источника, который приходится держать в согласии, адреса
-- читаются из `public.be_branches` в момент самого чтения визитки. Рассинхрон становится
-- невозможным по построению, а не по проверке.
--
-- `app.save_public_clinic_card` продолжает писать `locations_json`, но эта колонка сейчас без
-- читателя — решение о её удалении за ведущим (задевает форму сохранения, а колонка сама по себе
-- миграции не стоит).
CREATE OR REPLACE FUNCTION app.read_public_clinic_card(p_slug text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $_$
DECLARE
  v_card jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_clinic_card_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'clinic.public-card.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_public_clinic_card(text)'::regprocedure);

  SELECT jsonb_build_object(
    'requestedSlug', requested.slug,
    'canonicalSlug', current_claim.slug,
    'disposition', CASE WHEN requested.kind = 'alias' THEN 'redirect' ELSE 'current' END,
    'displayName', entry.display_name,
    'description', entry.description,
    'publicContactPhone', entry.public_contact_phone,
    'publicContactEmail', entry.public_contact_email,
    'publicWebsiteUrl', entry.public_website_url,
    'locations', branches.locations,
    'media', media.assets
  )
  INTO v_card
  FROM public.organization_slug_claims AS requested
  INNER JOIN public.organization_slug_claims AS current_claim
    ON current_claim.organization_id = requested.organization_id
   AND current_claim.kind = 'current'
  INNER JOIN public.clinic_public_directory_entries AS entry
    ON entry.organization_id = requested.organization_id
   AND entry.is_published = true
   AND entry.card_is_published = true
  INNER JOIN public.be_organizations AS organization
    ON organization.id = requested.organization_id
   AND organization.is_active = true
  LEFT JOIN LATERAL (
    -- Живые филиалы клиники в момент самого чтения, не снимок из прошлого сохранения формы.
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('title', branch.title, 'cityCode', branch.city_code, 'address', branch.address)
        ORDER BY branch.sort_order, branch.title
      ),
      '[]'::jsonb
    ) AS locations
    FROM public.be_branches AS branch
    WHERE branch.organization_id = entry.organization_id
      AND branch.is_active = true
  ) AS branches ON true
  LEFT JOIN LATERAL (
    -- Тот же предикат готовности, что у логотипа бренда организации: файл принадлежит организации,
    -- ИМЕННО этой, загрузка завершена, это картинка. Не прошедший файл просто не попадает в набор —
    -- страница показывает место под логотип, а не битую картинку.
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', asset.media_id,
          'role', asset.role,
          'mimeType', asset.mime_type,
          's3Key', asset.s3_key,
          'storedPath', asset.stored_path
        )
        ORDER BY asset.position
      ),
      '[]'::jsonb
    ) AS assets
    FROM (
      SELECT logo.id AS media_id, 'logo'::text AS role, 0::bigint AS position,
             logo.mime_type, logo.s3_key, logo.stored_path
        FROM public.media_files AS logo
       WHERE logo.id = entry.logo_media_id
         AND logo.owner_kind = 'organization'
         AND logo.organization_id = entry.organization_id
         AND logo.status = 'ready'
         AND logo.mime_type LIKE 'image/%'
      UNION ALL
      SELECT photo.id, 'photo'::text, requested_photo.position,
             photo.mime_type, photo.s3_key, photo.stored_path
        FROM unnest(entry.photo_media_ids) WITH ORDINALITY AS requested_photo(media_id, position)
        INNER JOIN public.media_files AS photo
          ON photo.id = requested_photo.media_id
         AND photo.owner_kind = 'organization'
         AND photo.organization_id = entry.organization_id
         AND photo.status = 'ready'
         AND photo.mime_type LIKE 'image/%'
    ) AS asset
  ) AS media ON true
  WHERE requested.slug = lower(btrim(p_slug))
    AND requested.kind IN ('current', 'alias')
  LIMIT 1;

  RETURN v_card;
END
$_$;
