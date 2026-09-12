-- BCB-MIGRATION-OWNER: app_seam_patient_org_projection_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_function_result('app.read_current_patient_active_organizations()'::pg_catalog.regprocedure) LIKE '%uses_own_patient_app boolean%'
--
-- Владелец 12.09.2026, дословно: «Галочку надо сделать, фильтрацию списка надо сделать для
-- пациентов. Для пациентов организация пропадает из общей платформы в тот момент, когда включается
-- галочка. Когда организация там поставит свой домен, когда она его не поставит, будет она это
-- делать или нет? Нас это не касается. Галочку включили — из общего списка пропали. Всё, вы на
-- бренде.»
--
-- Признак организации — `clinic_uses_own_patient_app` в общем реестре `system-settings`: «своё
-- приложение вместо общей платформы». Готовность домена в него НЕ входит и входить не должна —
-- владелец отверг это прямо, отдельным решением.
--
-- ПОЧЕМУ ПРИЗНАК ЕДЕТ РЯДОМ СО СПИСКОМ, А НЕ ВТОРЫМ ЗАПРОСОМ. Список организаций пациента — он же
-- источник ответа на вопрос «пускать ли этого пациента в эту организацию»: приложение ищет в нём
-- проверенную цель брендированного хоста. Прочитай фильтр признак отдельно — и у фильтра списка
-- была бы одна картина, а у проверки входа другая, с окном между ними. Здесь картина одна.
--
-- СКРЫТИЕ ЖИВЁТ В ПРИЛОЖЕНИИ, А НЕ ЗДЕСЬ, и это намеренно: дверь обязана вернуть ПОЛНЫЙ список,
-- иначе на собственном домене клиники её собственный пациент перестал бы находиться в своём же
-- списке и получил бы отказ входа. Кто именно скрыт, решает вызывающая сторона, у которой есть
-- хост запроса; дверь только называет факт.
--
-- Права: добавляется чтение четырёх колонок `public.system_settings` — тех же, что уже читают
-- соседние двери этого шва; отражено в `deploy/postgres/privileges/declaration.ts`. Владелец и
-- роли исполнения прежние. DROP + CREATE, а не CREATE OR REPLACE: PostgreSQL не меняет тип
-- возврата RETURNS TABLE заменой.
DROP FUNCTION app.read_current_patient_active_organizations();
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_org_projection_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.read_current_patient_active_organizations()
RETURNS TABLE (
  organization_id uuid,
  organization_title text,
  platform_user_id uuid,
  enrollment_created_at timestamp with time zone,
  uses_own_patient_app boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_org_projection_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.organization.resolve', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.read_current_patient_active_organizations()'::regprocedure);

  PERFORM app.require_attested_context_for_roles('app_seam_patient_org_projection_owner'::name, ARRAY['app_patient'::name]::name[]);
  IF v_patient_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    organization.id,
    organization.title,
    v_patient_user_id,
    enrollment.created_at,
    COALESCE((own_app.value_json ->> 'value')::boolean, false)
  FROM public.org_enrollments AS enrollment
  INNER JOIN public.be_organizations AS organization
    ON organization.id = enrollment.organization_id
   AND organization.is_active = true
  LEFT JOIN public.system_settings AS own_app
    ON own_app.key = 'clinic_uses_own_patient_app'
   AND own_app.scope = 'admin'
   AND own_app.organization_id = organization.id
  WHERE enrollment.platform_user_id = v_patient_user_id
    AND enrollment.status = 'active'
  ORDER BY enrollment.created_at, organization.id;
END
$$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_org_projection_owner
COMMENT ON FUNCTION app.read_current_patient_active_organizations() IS
  'Active organization enrollments of the current patient, each flagged with whether the clinic runs its own branded patient app instead of the shared platform (owner 2026-09-12). The door always returns the full list; hiding is the caller''s decision, because only the caller knows the request Host.';
