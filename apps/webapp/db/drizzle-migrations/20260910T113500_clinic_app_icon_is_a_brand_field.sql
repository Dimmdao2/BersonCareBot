-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = pg_catalog.to_regclass('public.org_brand_revisions') AND a.attname = 'app_icon_media_id' AND NOT a.attisdropped) AND pg_catalog.strpos((SELECT p.prosrc FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.guard_org_brand_revision()')), 'org_brand_app_icon_media_must_be_owned_by_organization') > 0 AND pg_catalog.pg_get_function_result('app.read_anonymous_patient_surface_projection(uuid)'::pg_catalog.regprocedure) LIKE '%app_icon_media_id uuid%'
-- Владелец 10.09.2026: «иконка брендированного приложения и сайта пациента должна настраиваться
-- в кабинете доктора, она же и на фавикон должна ставиться». Вариант A владельца — ОТДЕЛЬНОЕ поле
-- рядом с логотипом, а не переиспользование логотипа: логотип клиники почти всегда широкий, и
-- квадрат 192×192 с фавиконом 32×32 из него получаются обрезанными. Поэтому у ревизии бренда
-- появляется вторая ссылка на `public.media_files` — источник, из которого сервер выводит готовые
-- размеры; сами размеры в БД не хранятся (это файлы в объектном хранилище).
--
-- FK `ON DELETE SET NULL` — ровно как у логотипа: удаление медиа-файла деградирует бренд до
-- платформенного набора иконок, а не роняет ревизию. Частичный индекс нужен обратному обходу
-- «какие ревизии держат этот медиа-файл» в воркере чистки медиа.
ALTER TABLE public.org_brand_revisions
  ADD COLUMN app_icon_media_id uuid;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.org_brand_revisions
  ADD CONSTRAINT org_brand_revisions_app_icon_media_id_fkey
  FOREIGN KEY (app_icon_media_id) REFERENCES public.media_files(id) ON DELETE SET NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX idx_org_brand_revisions_app_icon_media
  ON public.org_brand_revisions (app_icon_media_id)
  WHERE app_icon_media_id IS NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
COMMENT ON COLUMN public.org_brand_revisions.app_icon_media_id IS
  'Square source artwork for the clinic installed-app icon and favicon (owner decision 2026-09-10, variant A). Ready sizes are derived files in object storage, never rows.';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Триггер ревизии бренда обязан узнать о новой колонке в ТРЁХ местах, иначе она пробивает уже
-- закрытые инварианты:
--   1) владение медиа — иконка приложения, как и логотип, должна принадлежать ЭТОЙ организации,
--      иначе клиника поставила бы себе на фавикон чужой файл по одному uuid;
--   2) неизменяемость опубликованного — без строки в списке иммутабельности иконку опубликованной
--      ревизии можно было бы подменить, обойдя append-only контракт (публикация = новая ревизия);
--   3) терпимость к каскаду FK — `ON DELETE SET NULL` заставляет PostgreSQL выполнить
--      `UPDATE ... SET app_icon_media_id = NULL` на опубликованной/архивной строке, и без ветки
--      терпимости это P0001, который ломает воркер чистки медиа (он терпит только класс 23,
--      а объекты в S3 к тому моменту уже удалены) — тот же дефект, что был у логотипа (audit HIGH 2).
-- Ветка терпимости расширена симметрично и НЕ ослаблена: whole-row сравнение теперь вычитает обе
-- медиа-колонки, но каждая из них по отдельности обязана либо не измениться, либо перейти
-- non-NULL -> NULL, и хотя бы одна обязана измениться. Прямая запись (`pg_trigger_depth() = 1`)
-- по-прежнему отвергается, updated_at по-прежнему не перештампован.
CREATE OR REPLACE FUNCTION app.guard_org_brand_revision() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'org_brand_revision_must_be_created_as_draft';
    END IF;
  ELSE
    -- FK-DRIVEN BRAND-MEDIA DEGRADATION (audit HIGH 2, 2026-07-25; app icon added 2026-09-10).
    -- `logo_media_id`/`app_icon_media_id … ON DELETE SET NULL` make PostgreSQL issue
    -- `UPDATE ONLY public.org_brand_revisions SET <column> = NULL` when a referenced
    -- public.media_files row is deleted, and that UPDATE fires this trigger. Without this branch it
    -- raised P0001 on every published/archived row, which broke the media purge worker
    -- (s3MediaStorage.purgePendingMediaDeleteBatch tolerates only SQLSTATE class 23 and had already
    -- deleted the S3 objects) and made the documented §10 degradation "brand invalid asset ->
    -- platform fallback + safe org text" unreachable.
    -- The tolerance is DELIBERATELY the narrowest possible: the ONLY accepted change is a brand-media
    -- column going non-NULL -> NULL. `to_jsonb(NEW) - 'logo_media_id' - 'app_icon_media_id'` vs the
    -- same subtraction on OLD compares EVERY OTHER column (including status, display_name, the actor
    -- trail, published_at/archived_at and updated_at) whole-row, so it stays correct when a column is
    -- added later; the two per-column tests below keep each media column itself narrow, so clearing
    -- one may not smuggle in a new value for the other. Consequences kept intact: setting a NEW asset
    -- on a published/archived row is still rejected, clearing an asset together with any other edit is
    -- still rejected, and updated_at is intentionally NOT re-stamped so only cleared columns change.
    -- `pg_trigger_depth() > 1` restricts the tolerance to a CASCADED write: the referential-action
    -- UPDATE runs inside the RI trigger of the public.media_files DELETE, so it always sees depth >= 2,
    -- while a statement issued directly by app_staff sees depth = 1. Without it the branch was a direct
    -- write hole: `UPDATE org_brand_revisions SET logo_media_id = NULL WHERE id = ...` succeeded on
    -- published and archived rows, changing the live branded surface and rewriting the append-only audit
    -- row with no trace (updated_at is deliberately not re-stamped) -- contradicting this file's own
    -- "published -> archived and NOTHING else" / "archived -> immutable forever" contract and
    -- BRANDING_DOMAIN_CONTRACT invariant 3.8.
    IF TG_OP = 'UPDATE'
       AND pg_trigger_depth() > 1
       AND OLD.status IN ('published', 'archived')
       AND (OLD.logo_media_id IS NOT NULL AND NEW.logo_media_id IS NULL
            OR OLD.app_icon_media_id IS NOT NULL AND NEW.app_icon_media_id IS NULL)
       AND (NEW.logo_media_id IS NOT DISTINCT FROM OLD.logo_media_id
            OR OLD.logo_media_id IS NOT NULL AND NEW.logo_media_id IS NULL)
       AND (NEW.app_icon_media_id IS NOT DISTINCT FROM OLD.app_icon_media_id
            OR OLD.app_icon_media_id IS NOT NULL AND NEW.app_icon_media_id IS NULL)
       AND to_jsonb(NEW) - 'logo_media_id' - 'app_icon_media_id'
           = to_jsonb(OLD) - 'logo_media_id' - 'app_icon_media_id' THEN
      RETURN NEW;
    END IF;

    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'org_brand_revision_organization_is_immutable';
    END IF;
    IF NEW.created_by_platform_user_id IS DISTINCT FROM OLD.created_by_platform_user_id THEN
      RAISE EXCEPTION 'org_brand_revision_author_is_immutable';
    END IF;
    IF OLD.status = 'archived' THEN
      RAISE EXCEPTION 'org_brand_revision_archived_is_immutable';
    END IF;
    IF OLD.status = 'published' THEN
      IF NEW.status <> 'archived' THEN
        RAISE EXCEPTION 'org_brand_revision_published_only_archives';
      END IF;
      IF NEW.display_name IS DISTINCT FROM OLD.display_name
         OR NEW.logo_media_id IS DISTINCT FROM OLD.logo_media_id
         OR NEW.app_icon_media_id IS DISTINCT FROM OLD.app_icon_media_id
         OR NEW.published_at IS DISTINCT FROM OLD.published_at
         OR NEW.published_by_platform_user_id IS DISTINCT FROM OLD.published_by_platform_user_id THEN
        RAISE EXCEPTION 'org_brand_revision_published_content_is_immutable';
      END IF;
    ELSIF NEW.status NOT IN ('draft', 'published') THEN
      RAISE EXCEPTION 'org_brand_revision_draft_transition_not_allowed';
    END IF;
  END IF;

  IF NEW.logo_media_id IS NOT NULL THEN
    PERFORM 1
    FROM public.media_files AS logo
    WHERE logo.id = NEW.logo_media_id
      AND logo.owner_kind = 'organization'
      AND logo.organization_id = NEW.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'org_brand_logo_media_must_be_owned_by_organization';
    END IF;
  END IF;

  IF NEW.app_icon_media_id IS NOT NULL THEN
    PERFORM 1
    FROM public.media_files AS app_icon
    WHERE app_icon.id = NEW.app_icon_media_id
      AND app_icon.owner_kind = 'organization'
      AND app_icon.organization_id = NEW.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'org_brand_app_icon_media_must_be_owned_by_organization';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner
-- Анонимная проекция поверхности отдаёт id иконки приложения тем же способом, каким уже отдаёт
-- логотип: медиа-файл проверяется на принадлежность организации, статус `ready` и картиночный
-- mime, и только после этого id доходит до брендированной поверхности. Отдаётся id, а не готовый
-- URL, потому что у иконки не один URL, а набор размеров; собирает набор `patientPwaIconSet`.
-- DROP + CREATE, а не CREATE OR REPLACE: PostgreSQL не меняет тип возврата RETURNS TABLE заменой.
DROP FUNCTION app.read_anonymous_patient_surface_projection(uuid);
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
    COALESCE((skip_setting.value_json ->> 'value')::boolean, false),
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
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner
COMMENT ON FUNCTION app.read_anonymous_patient_surface_projection(uuid) IS
  'Anonymous-safe brand/slug/redirect projection for an already-resolved organization id (B4a/B2). No row for an unknown, inactive, or unpublished-slug organization.';
