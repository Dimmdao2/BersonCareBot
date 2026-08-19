-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0042
--
-- Решение владельца 19.08, дословно: «так эту таблицу надо просто удалить, у нас не будт записей
-- во внешних системах» и «и проверку тоже чтобу не было мертвого кода».
--
-- `public.be_external_entity_mappings` несла ограничение
--   CHECK (external_system = ANY (ARRAY['rubitime'::text]))
-- Rubitime выведен из эксплуатации 27.07.2026, то есть единственная разрешённая система больше
-- не существует и записать в таблицу нельзя НИЧЕГО. Это и заперло фикстуру на две клиники:
-- `saas_test_fixture` получал `23514` (docs/_TODO/TEST_FIXTURE_HAS_NO_DOOR_2026-08-19.md §4).
--
-- Первый шаг — корень интегратора. `app.read_canonical_appointment_by_external_id(text)` искал
-- запись двумя способами: по каноническому ключу `be:<uuid>` и, если не нашёл, по строке
-- сопоставления с `external_system = 'rubitime'`. Второй способ ищет в системе, которой нет;
-- вместе с ним уходят приоритет ветвей и сортировка по нему — остаётся ровно один вход.

CREATE OR REPLACE FUNCTION app.read_canonical_appointment_by_external_id(p_external_id text)
RETURNS TABLE(
  id uuid,
  organization_id uuid,
  phone_normalized text,
  start_at timestamp with time zone,
  status text,
  attribution_json jsonb,
  branch_id uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
PARALLEL RESTRICTED
SECURITY DEFINER
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_worker'::name, 'service'::app.port_context_class, 'booking.integrator-record.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_canonical_appointment_by_external_id(text)'::regprocedure);

  IF p_external_id IS NULL OR btrim(p_external_id) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'external appointment id required';
  END IF;
  RETURN QUERY
    WITH target AS (
      SELECT direct.canonical_id
        FROM (SELECT CASE
                       WHEN p_external_id ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                       THEN substring(p_external_id FROM 4)::uuid
                     END AS canonical_id) direct
       WHERE direct.canonical_id IS NOT NULL
    )
    SELECT appointment.id, appointment.organization_id, appointment.phone_normalized,
           appointment.start_at, appointment.status, appointment.attribution_json,
           appointment.branch_id, appointment.created_at, appointment.updated_at,
           appointment.deleted_at
      FROM target
      JOIN public.be_appointments appointment ON appointment.id = target.canonical_id
     LIMIT 1;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Второй корень — резолвер арендатора публичной записи. Третий аргумент
-- `p_branch_service_id` переводил устаревший id связки «филиал+услуга» Rubitime в организацию
-- через `metadata->>'legacy_branch_service_id'` той же таблицы. Единственный вызывающий,
-- `apps/webapp/src/infra/repos/pgBookingScheduling.ts`, ВСЕГДА передавал сюда `null` — то есть
-- ветка была недостижима из приложения ещё до этой правки. Удаление аргумента — смена сигнатуры,
-- поэтому старая снимается явным DROP, иначе рядом остался бы второй overload.

DROP FUNCTION IF EXISTS app.resolve_public_booking_organization(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION app.resolve_public_booking_organization(
  p_branch_id uuid,
  p_service_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_ids uuid[];
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_public_booking_owner'::name, ARRAY['app_patient'::name]::name[]);

  -- Обе половины канонической пары обязательны: по половине арендатор не определяется.
  IF p_branch_id IS NULL OR p_service_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(DISTINCT b.organization_id)
  INTO v_organization_ids
  FROM public.be_branches AS b
  INNER JOIN public.be_clinic_services AS s
    ON s.organization_id = b.organization_id
  INNER JOIN public.be_specialist_service_availability AS availability
    ON availability.organization_id = b.organization_id
   AND availability.branch_id = b.id
   AND availability.service_id = s.id
  WHERE b.id = p_branch_id
    AND s.id = p_service_id
    AND b.is_active = true
    AND s.is_active = true
    AND s.public_widget_visible = true
    AND s.admin_manual_only = false
    AND availability.is_active = true;

  IF cardinality(v_organization_ids) = 1 THEN
    RETURN v_organization_ids[1];
  END IF;
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION app.resolve_public_booking_organization(uuid, uuid) IS
  'Narrow fail-closed tenant resolver for public in-person booking bootstrap. Returns an org only for one active same-org canonical branch+service availability context.';

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
--
-- Сама таблица. Ни одного внешнего ключа на неё не ссылается (проверено на `bcb_webapp_dev`:
-- `SELECT conname FROM pg_constraint WHERE confrelid = 'public.be_external_entity_mappings'::regclass`
-- — пусто), поэтому DROP без CASCADE достаточен и ничего соседнего не утащит. Вместе с таблицей
-- уходят её CHECK-ограничения, индексы, гранты и политики RLS `rev10_*`/`saas_org_dormant_p0_8_3`.
--
-- Содержимое на момент удаления — целиком эпохи Rubitime: DEV 408 строк, TEST 479
-- (appointment/availability/service/specialist/branch), все с `external_system = 'rubitime'`.
-- Ни одна из них не описывает живую внешнюю систему.

DROP TABLE IF EXISTS public.be_external_entity_mappings;

--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
--
-- Рычаги без механизма. Владелец 19.08: «Рычаги - вред». Эти ключи `system_settings` описывали
-- выбор между каноническим и Rubitime-контуром: источник слотов, источник записей врача и общий
-- переключатель моста. Сам выбор умер 14.07.2026 (`a656803a3`: `parseBookingSlotsReadSource` стал
-- безусловным `'canonical'`), а последний файл ветвления удалён 27.07 (`f9365e51b`). Читателя ни
-- у одного из ключей в коде нет; их даже нельзя показать или записать через `/api/admin/settings`
-- — в `SYSTEM_SETTING_REGISTRY` их тоже нет. То есть строка в базе ничего не переключает, но
-- администратору, который до неё доберётся, обещает выбор источника записей.
--
-- `rubitime_api_key` и `rubitime_webhook_token` здесь СОЗНАТЕЛЬНО не трогаются: это живые
-- учётные данные, и владелец 19.08 отдельно решил снимать их при миграции с прод-дампа
-- (docs/OPERATIONS/PROD_DATA_CLEANUP_SPEC.md).

DELETE FROM public.system_settings
WHERE key IN (
  'booking_slots_read_source',
  'booking_doctor_appointments_read_source',
  'booking_rubitime_bridge_enabled',
  'booking_calendar_read_source',
  'rubitime_webhook_uri',
  'rubitime_schedule_mapping'
);
