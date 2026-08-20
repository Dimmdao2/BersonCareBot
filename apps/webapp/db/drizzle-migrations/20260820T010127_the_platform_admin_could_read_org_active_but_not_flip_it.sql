-- BCB-MIGRATION-OWNER: app_seam_org_directory_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Имя по таймштамп-схеме (решение владельца 20.08: новые миграции только YYYYMMDDTHHMMSS_).
-- Прежнее имя 0050_… отвергалось гейтом: номер занят, старая схема закрыта для новых.
--
-- `app_platform_settings` на `public.be_organizations` имеет UPDATE только на `tariff_id` и
-- `updated_at` — колонка `is_active` читается, но не переключается из вебаппа. Карточка клиники
-- в глобальном админе показывала «Учётная запись: Включена/Отключена» без действия.
--
-- Одна дверь под тем же владельцем, что `app.list_platform_organization_members(uuid)`:
-- EXECUTE только `app_platform_settings`, без новых грантов на отношение.

CREATE OR REPLACE FUNCTION app.set_platform_organization_is_active(
  p_organization_id uuid,
  p_is_active boolean
)
RETURNS TABLE(organization_id uuid, is_active boolean, changed boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_before boolean;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_org_directory_owner'::name,
    'app_platform_settings'::name,
    'platform'::app.port_context_class,
    'platform.organization.set-is-active',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('boolean@1', pg_catalog.boolsend(p_is_active))::app.port_typed_arg
    ]),
    'app.set_platform_organization_is_active(uuid,boolean)'::regprocedure
  );

  SELECT org.is_active
    INTO v_before
    FROM public.be_organizations AS org
   WHERE org.id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'organization_not_found';
  END IF;

  IF v_before = p_is_active THEN
    RETURN QUERY SELECT p_organization_id, p_is_active, false;
    RETURN;
  END IF;

  UPDATE public.be_organizations AS org
     SET is_active = p_is_active,
         updated_at = pg_catalog.now()
   WHERE org.id = p_organization_id;

  RETURN QUERY SELECT p_organization_id, p_is_active, true;
END
$function$;
