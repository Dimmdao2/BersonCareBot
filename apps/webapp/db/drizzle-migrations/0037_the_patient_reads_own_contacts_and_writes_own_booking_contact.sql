-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0037
--
-- Пациент записывался — и телефон с почтой, которые он набрал в форме, исчезали.
--
-- Что было замерено 19.08 на `bcb_webapp_dev`. Одна запись пациента через
-- `POST /api/booking/create` даёт ровно один отказ в журнале PostgreSQL:
--   2026-08-19 07:20:31.523 MSK bcb_dev_webapp_patient@bcb_webapp_dev 42501
--   ERROR: permission denied for table platform_users
--   STATEMENT: SELECT pu.id, ui.display_name AS display_name,
--              uc_pri_phone.value_normalized AS phone_normalized, pu.created_at, …
-- и ноль строк в `platform_user_contacts` для этого человека.
--
-- Почему. `persistBookingFormContacts` (`canonicalCreate.ts`) спрашивал контакты человека у
-- ДОКТОРСКОГО порта — `doctorClientsPort.getClientIdentity` (`pgDoctorClients.ts`). Тот отдаёт
-- ПЕРСОНАЛЬНУЮ проекцию клиента: ФИО из `user_identity`, привязки мессенджеров, признаки
-- «заблокирован» и «в архиве», причину блокировки. Под принципалом пациента это чтение и должно
-- быть закрыто: `platform_users` — единственная таблица ПДн, у `app_patient` на ней колоночный
-- SELECT без `created_at`, `blocked_reason` и без `user_identity`/`user_contacts` вовсе. Стена
-- права, спрашивал не тот порт.
--
-- Второй, невидимый из-за первого отказ: писать было тоже нечем. У `app_patient` на
-- `public.platform_user_contacts` нет НИ ОДНОЙ привилегии (`information_schema.column_privileges`
-- 19.08: строки только у `app_object_owner`, `app_staff`, `app_tenant_service`). Даже если бы
-- чтение прошло, `upsertContact` упёрся бы в тот же 42501.
--
-- Что делает эта миграция. Два объявленных корня по форме соседей (0033/0035): вызывающий передаёт
-- КОНТЕКСТ, а строку читает и пишет владелец шва. Владелец — `app_seam_patient_booking_owner`, тот
-- же, что уже владеет `create_current_patient_booking_pending` и
-- `save_current_patient_booking_form_answers`: чтение контактов и запись контактов — части ОДНОГО
-- шага записи на приём, разносить их по двум швам не за чем.
--
-- Ни одна рабочая роль не получает новых табличных грантов: `app_patient` получает только EXECUTE.
-- Поверхность владельца шва (`platform_users` три колонки, `user_contacts` четыре,
-- `platform_user_contacts`) выводится генератором из объявленных `relationSurfaces` — руками в
-- `generated/*.sql` не написано ничего.
--
-- Личность вызывающего корни НЕ принимают аргументом ни в каком виде. Она берётся из принятого
-- контекста порта (`app.current_patient_user_id()`), поэтому «прочитать чужое» и «записать на
-- чужого» невыразимы, а не запрещены проверкой.

CREATE OR REPLACE FUNCTION app.read_current_patient_identity_contacts(
  OUT o_phone text,
  OUT o_email text
)
RETURNS record
LANGUAGE plpgsql
STABLE
PARALLEL RESTRICTED
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_patient uuid := app.current_patient_user_id();
-- Имена OUT-параметров несут префикс `o_`: без него `email` совпал бы с колонкой
-- `platform_users.email`. Рукописный ТОЧНЫЙ гейт: проверка требует, чтобы за открывающим ключевым
-- словом немедленно следовал вызов `app.require_*`, поэтому комментарий стоит выше тела.
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner'::name,
    'app_patient'::name,
    'patient'::app.port_context_class,
    'booking.patient-identity-contacts.read',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.read_current_patient_identity_contacts()'::regprocedure
  );

  IF v_patient IS NULL THEN
    RAISE EXCEPTION 'accepted patient context required' USING ERRCODE = '42501';
  END IF;

  -- `user_contacts` — источник истины по телефону (D15b/6), `platform_users.email` — по почте:
  -- ровно те два поля, которые сравнивает `shouldSkipSupplementaryContactUpsert`. Ни ФИО, ни
  -- привязок, ни признаков блокировки корень не возвращает — вызывающему они не нужны.
  SELECT contact.value_normalized
  INTO o_phone
  FROM public.user_contacts AS contact
  WHERE contact.platform_user_id = v_patient
    AND contact.contact_kind = 'phone'
    AND contact.is_primary = TRUE
  LIMIT 1;

  SELECT account.email
  INTO o_email
  FROM public.platform_users AS account
  WHERE account.id = v_patient
    AND account.merged_into_id IS NULL;
END
$function$;

CREATE OR REPLACE FUNCTION app.record_current_patient_booking_contact(
  p_contact_type text,
  p_value text,
  p_value_normalized text,
  OUT o_id uuid,
  OUT o_platform_user_id uuid,
  OUT o_contact_type text,
  OUT o_value text,
  OUT o_value_normalized text,
  OUT o_source text,
  OUT o_created_at timestamp with time zone,
  OUT o_updated_at timestamp with time zone
)
RETURNS record
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_patient uuid := app.current_patient_user_id();
  v_org uuid := app.current_org_id();
-- Тот же рукописный точный гейт; комментарий выше тела по той же причине.
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner'::name,
    'app_patient'::name,
    'patient'::app.port_context_class,
    'booking.patient-contact.record',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_contact_type))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_value))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_value_normalized))::app.port_typed_arg
    ]),
    'app.record_current_patient_booking_contact(text,text,text)'::regprocedure
  );

  IF v_patient IS NULL THEN
    RAISE EXCEPTION 'accepted patient context required' USING ERRCODE = '42501';
  END IF;
  IF p_contact_type NOT IN ('phone', 'email') THEN
    RAISE EXCEPTION 'booking_contact_type_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_value IS NULL OR btrim(p_value) = '' OR length(p_value) > 320
     OR p_value_normalized IS NULL OR btrim(p_value_normalized) = ''
     OR length(p_value_normalized) > 320 THEN
    RAISE EXCEPTION 'booking_contact_value_invalid' USING ERRCODE = '22023';
  END IF;

  -- Имена OUT-параметров несут префикс `o_` намеренно: без него они совпали бы с именами колонок
  -- `platform_user_contacts`, и подстановка переменных plpgsql сделала бы `ON CONFLICT`-цель и
  -- список RETURNING неоднозначными.
  -- `source` корень назначает сам: строка родилась в форме записи, и назвать её докторской или
  -- админской пациент не может — от этого зависит право персонала её удалить
  -- (`deleteStaffManagedContact`). Арендатор берётся из принятого контекста, а не из аргумента.
  INSERT INTO public.platform_user_contacts AS contact (
    platform_user_id, organization_id, contact_type, value, value_normalized, source,
    created_at, updated_at
  ) VALUES (
    v_patient, v_org, p_contact_type, btrim(p_value), p_value_normalized, 'booking',
    now(), now()
  )
  ON CONFLICT (platform_user_id, contact_type, value_normalized) DO UPDATE
    SET value = excluded.value,
        source = excluded.source,
        organization_id = COALESCE(contact.organization_id, excluded.organization_id),
        updated_at = now()
  RETURNING contact.id, contact.platform_user_id, contact.contact_type, contact.value,
            contact.value_normalized, contact.source, contact.created_at, contact.updated_at
  INTO o_id, o_platform_user_id, o_contact_type, o_value, o_value_normalized, o_source,
       o_created_at, o_updated_at;
END
$function$;
