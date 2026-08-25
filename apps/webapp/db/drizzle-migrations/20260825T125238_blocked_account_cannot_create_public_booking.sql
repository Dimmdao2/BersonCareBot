-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.resolve_public_booking_client_by_phone(text,text,boolean)
-- BCB-MIGRATION-VERIFY: SELECT position('is_blocked' in pg_catalog.pg_get_functiondef('app.resolve_public_booking_client_by_phone(text,text,boolean)'::regprocedure)) > 0
-- A blocked canonical holder is never returned to the public booking flow and no duplicate identity
-- is created for the same phone.
CREATE OR REPLACE FUNCTION app.resolve_public_booking_client_by_phone(p_phone_normalized text, p_display_name text, p_phone_proven boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  v_candidates uuid[];
  v_id uuid;
  v_display text;
  v_is_blocked boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_booking_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'booking.public-client.resolve', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($3))::app.port_typed_arg]), 'app.resolve_public_booking_client_by_phone(text,text,boolean)'::regprocedure);

  -- Формат телефона проверяет сама дверь: вызывающий нормализует, но дверь ему не верит.
  IF p_phone_normalized IS NULL OR p_phone_normalized !~ '^\\+[1-9][0-9]{7,14}$' THEN
    RETURN NULL;
  END IF;

  v_display := pg_catalog.btrim(COALESCE(p_display_name, ''));
  IF v_display = '' THEN
    v_display := p_phone_normalized;
  END IF;
  v_display := pg_catalog.left(v_display, 500);

  SELECT pg_catalog.array_agg(candidate.id)
  INTO v_candidates
  FROM (
    SELECT person.id
    FROM public.platform_users AS person
    WHERE person.merged_into_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.user_contacts AS contact
        WHERE contact.platform_user_id = person.id
          AND contact.contact_kind = 'phone'
          AND contact.is_primary = true
          AND contact.value_normalized = p_phone_normalized
      )
    LIMIT 2
  ) AS candidate;

  -- Два живых аккаунта на один телефон — состояние, которое разбирают слиянием, а не догадкой.
  IF pg_catalog.cardinality(v_candidates) > 1 THEN
    RETURN NULL;
  END IF;
  IF pg_catalog.cardinality(v_candidates) = 1 THEN
    SELECT COALESCE(person.is_blocked, false)
    INTO v_is_blocked
    FROM public.platform_users AS person
    WHERE person.id = v_candidates[1];

    IF v_is_blocked THEN
      RETURN NULL;
    END IF;
    RETURN v_candidates[1];
  END IF;

  INSERT INTO public.platform_users (display_name, role)
  VALUES (
    v_display,
    'client'
  )
  RETURNING id INTO v_id;

  INSERT INTO public.user_identity (
    platform_user_id, first_name, last_name, patronymic, display_name, updated_at
  )
  SELECT person.id, person.first_name, person.last_name, person.patronymic,
         COALESCE(person.display_name, ''), now()
  FROM public.platform_users AS person
  WHERE person.id = v_id
  ON CONFLICT (platform_user_id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    patronymic = EXCLUDED.patronymic,
    display_name = EXCLUDED.display_name,
    updated_at = now();

  INSERT INTO public.user_contacts (
    platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at, source_origin, updated_at
  )
  VALUES (
    v_id, 'phone', p_phone_normalized, true,
    CASE WHEN p_phone_proven THEN now() ELSE NULL END, 'direct', now()
  );

  RETURN v_id;
END;
$_$;

