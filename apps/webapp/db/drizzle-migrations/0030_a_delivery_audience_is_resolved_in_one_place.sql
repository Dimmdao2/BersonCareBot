-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0030
--
-- Два маршрута вебаппа собирали аудиторию доставки СЫРЫМИ чтениями отношений под классами
-- контекста, у которых на порту вебаппа relation-возможности нет и по замыслу не будет:
-- `/api/integrator/delivery-targets` входит организационным принципалом (`tenant_service`), а
-- `/api/integrator/admin-notification-targets` не входит принципалом вовсе (`pre_session`).
-- Падало ДО базы — в `portContextRuntime.ts` («Missing declared webapp port capability»), поэтому
-- в журнале не было ни 42501, ни имени отношения.
--
-- Последствие для живого человека: подтверждение записи не уходило ни в Telegram, ни в MAX (при
-- 115 telegram- и 26 max-привязок в базе), а `fetchDeliveryTargets` глотал отказ и возвращал null,
-- из-за чего маршрут жизненного цикла записи писал «no delivery target» — ЛОЖЬ о данных. Второй
-- маршрут отдавал 502, вебапп ретраил его трижды с backoff.
--
-- Чинится НЕ расширением грантов (объявить `tenant_service`/`pre_session` relation-возможность —
-- это расширение прав, владельцем отклонено) и НЕ обёрткой каждого сырого чтения в свою функцию.
-- Аудитория доставки — ОДНА работа, и она уже решена один раз в
-- `app.read_patient_reminder_delivery_target_snapshot(...)`: стена участия, привязки каналов,
-- канальные и тематические предпочтения, подтверждение почты, web-push, VAPID, SMTP — в одном
-- месте, факты наружу, решение о каналах — в TypeScript. Здесь заводится РОВНО ОДИН сосед той же
-- формы, который умеет то, чего напоминалка уметь не должна: разрешить личность по телефону или
-- по внешнему id мессенджера. Своя цель (`integrator.delivery-targets.read`) — намеренно: цель
-- напоминалки нельзя переиспользовать, иначе система целей перестаёт что-либо объяснять.

CREATE OR REPLACE FUNCTION app.read_integrator_delivery_target_snapshot(
  p_organization_id uuid,
  p_phone_normalized text,
  p_telegram_id text,
  p_max_id text,
  p_platform_user_id uuid,
  p_integrator_user_id bigint,
  p_topic_code text,
  p_now timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_user_id uuid;
  v_match_count integer;
  v_integrator_user_id bigint;
  v_email text;
  v_email_verified_at timestamp with time zone;
  v_reminder_muted_until timestamp with time zone;
  v_preferences jsonb;
  v_topic_preferences jsonb;
  v_bindings jsonb;
  v_has_web_push boolean;
  v_topic_master_enabled boolean;
  v_vapid_configured boolean;
  v_smtp_configured boolean;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'integrator.delivery-targets.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_organization_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_phone_normalized))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_telegram_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_max_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_platform_user_id))::app.port_typed_arg,
      ROW('bigint@1', pg_catalog.int8send(p_integrator_user_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_topic_code))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send(p_now))::app.port_typed_arg
    ]),
    'app.read_integrator_delivery_target_snapshot(uuid,text,text,text,uuid,bigint,text,timestamp with time zone)'::regprocedure
  );

  IF v_org IS NULL OR p_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'delivery target organization mismatch' USING ERRCODE = '42501';
  END IF;

  -- Разрешение личности. Порядок селекторов — тот же, что был в TypeScript-резолвере:
  -- platformUserId → phone → telegram → max. Приоритет первого непустого, не «все сразу».
  IF p_platform_user_id IS NOT NULL THEN
    SELECT holder.id INTO v_user_id
    FROM public.platform_users AS holder
    WHERE holder.id = p_platform_user_id
      AND holder.merged_into_id IS NULL;
  ELSIF p_phone_normalized IS NOT NULL AND btrim(p_phone_normalized) <> '' THEN
    -- `user_contacts` — источник истины по телефону (одна учётка = один телефон). Несколько
    -- канонических строк на один телефон — это дефект данных, а не пустая аудитория: молча
    -- выбрать первую значило бы отправить уведомление постороннему.
    SELECT count(*), (array_agg(contact.platform_user_id))[1]
    INTO v_match_count, v_user_id
    FROM public.user_contacts AS contact
    JOIN public.platform_users AS holder ON holder.id = contact.platform_user_id
    WHERE contact.contact_kind = 'phone'
      AND contact.value_normalized = btrim(p_phone_normalized)
      AND holder.merged_into_id IS NULL;
    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'multiple canonical delivery targets for one phone' USING ERRCODE = '22023';
    END IF;
    IF v_match_count = 0 THEN
      v_user_id := NULL;
    END IF;
  ELSIF p_telegram_id IS NOT NULL AND btrim(p_telegram_id) <> '' THEN
    SELECT binding.user_id INTO v_user_id
    FROM public.user_channel_bindings AS binding
    JOIN public.platform_users AS holder ON holder.id = binding.user_id
    WHERE binding.channel_code = 'telegram'
      AND binding.external_id = btrim(p_telegram_id)
      AND holder.merged_into_id IS NULL;
  ELSIF p_max_id IS NOT NULL AND btrim(p_max_id) <> '' THEN
    SELECT binding.user_id INTO v_user_id
    FROM public.user_channel_bindings AS binding
    JOIN public.platform_users AS holder ON holder.id = binding.user_id
    WHERE binding.channel_code = 'max'
      AND binding.external_id = btrim(p_max_id)
      AND holder.merged_into_id IS NULL;
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'delivery_target_selector_required');
  END IF;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'delivery_target_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'delivery_target_outside_organization');
  END IF;

  SELECT holder.integrator_user_id, holder.email, holder.email_verified_at, holder.reminder_muted_until
  INTO v_integrator_user_id, v_email, v_email_verified_at, v_reminder_muted_until
  FROM public.platform_users AS holder
  WHERE holder.id = v_user_id
    AND holder.is_blocked = false
    AND holder.is_archived = false;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'delivery_target_not_found');
  END IF;
  IF p_integrator_user_id IS NOT NULL
     AND v_integrator_user_id IS DISTINCT FROM p_integrator_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'delivery_target_identity_mismatch');
  END IF;

  SELECT COALESCE(jsonb_object_agg(binding.channel_code, binding.external_id), '{}'::jsonb)
  INTO v_bindings
  FROM public.user_channel_bindings AS binding
  WHERE binding.user_id = v_user_id
    AND binding.channel_code IN ('telegram', 'max')
    AND binding.bot_blocked_at IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'channelCode', preference.channel_code,
    'isEnabledForMessages', preference.is_enabled_for_messages,
    'isEnabledForNotifications', preference.is_enabled_for_notifications,
    'isPreferredForAuth', preference.is_preferred_for_auth
  ) ORDER BY preference.channel_code), '[]'::jsonb)
  INTO v_preferences
  FROM public.user_channel_preferences AS preference
  WHERE preference.platform_user_id = v_user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'topicCode', preference.topic_code,
    'channelCode', preference.channel_code,
    'isEnabled', preference.is_enabled
  ) ORDER BY preference.topic_code, preference.channel_code), '[]'::jsonb)
  INTO v_topic_preferences
  FROM public.user_notification_topic_channels AS preference
  WHERE preference.user_id = v_user_id;

  SELECT COALESCE((
    SELECT topic.is_enabled
    FROM public.user_notification_topics AS topic
    WHERE topic.user_id = v_user_id
      AND topic.topic_code = p_topic_code
  ), true) INTO v_topic_master_enabled;

  SELECT EXISTS (
    SELECT 1 FROM public.user_web_push_subscriptions AS subscription
    WHERE subscription.user_id = v_user_id
  ) INTO v_has_web_push;

  SELECT EXISTS (
    SELECT 1 FROM public.system_settings AS setting
    WHERE setting.key = 'web_push_vapid'
      AND setting.scope = 'admin'
      AND setting.organization_id IS NULL
      AND btrim(COALESCE(setting.value_json #>> '{value,publicKey}', '')) <> ''
      AND btrim(COALESCE(setting.value_json #>> '{value,privateKey}', '')) <> ''
  ) INTO v_vapid_configured;

  SELECT EXISTS (
    SELECT 1 FROM public.system_settings AS setting
    WHERE setting.key = 'smtp_outbound'
      AND setting.scope = 'admin'
      AND setting.organization_id IS NULL
      AND btrim(COALESCE(setting.value_json #>> '{value,host}', '')) <> ''
      AND btrim(COALESCE(setting.value_json #>> '{value,user}', '')) <> ''
      AND btrim(COALESCE(setting.value_json #>> '{value,from}', '')) ~ '^[^[:space:]@]+@[^[:space:]@]+$'
      AND COALESCE(setting.value_json #>> '{value,port}', '') ~ '^[0-9]+$'
      AND (setting.value_json #>> '{value,port}')::integer BETWEEN 1 AND 65535
  ) INTO v_smtp_configured;

  RETURN jsonb_build_object(
    'ok', true,
    'platformUserId', v_user_id,
    'bindings', v_bindings,
    'channelPreferences', v_preferences,
    'topicChannelRows', v_topic_preferences,
    'emailRecipient', NULLIF(btrim(v_email), ''),
    'emailVerified', v_email_verified_at IS NOT NULL,
    'muted', v_reminder_muted_until IS NOT NULL AND v_reminder_muted_until > p_now,
    'topicMasterEnabled', v_topic_master_enabled,
    'hasWebPushSubscription', v_has_web_push,
    'vapidConfigured', v_vapid_configured,
    'smtpConfigured', v_smtp_configured
  );
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_telemetry_operator_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- Третья рукописная копия той же работы — адресаты ОПЕРАТОРСКИХ уведомлений
-- (`pgAdminNotificationTargets.ts`). Она несла комментарий «No RLS/new grant needed:
-- `platform_users` и `user_channel_bindings` и так читаются любой ролью», который перестал быть
-- правдой с введением режима port-контекста: чтение без принципала теперь не доходит до базы.
--
-- Свести её в ОДНО ТЕЛО с функцией выше нельзя, и это не лень: у неё другой класс контекста
-- (`pre_session` и `service` — организации нет вовсе), другая аудитория (держатели платформенной
-- роли `admin`, а не пациент организации) и другая стена (`org_enrollments` к ней неприменима).
-- Сводится то, что действительно общее, — МЕХАНИЗМ: объявленный именованный корень со своей целью
-- вместо сырого чтения отношения. Две объявленные возможности на одно тело — потому что этот же
-- список читает тик дайджеста под инфра-принципалом (класс `service`), и второго тела для него
-- заводить нельзя.
--
-- Гейт — первый оператор тела, и перед ним нет ни одной строки, включая комментарий:
-- верификатор тел (`bcb_runtime_definer_gates`) ищет первое вхождение ключевого слова открытия
-- блока и требует, чтобы сразу за ним шёл `PERFORM app.require_accepted_context(`. Проверка, до
-- которой можно что-то успеть сделать, проверкой не является. Значение `p_context_class` вне пары
-- допустимых валит приведение к `app.port_context_class` внутри самого гейта.
--
-- Класс приходит АРГУМЕНТОМ (дословно форма `app.passkey_issue_challenge`, которая одним телом
-- обслуживает `pre_session` и `patient`). Это не самоаттестация вызывающего: строку принятого
-- контекста ставит рантайм по фактическому принципалу, а `require_accepted_context` требует
-- ТОЧНОГО совпадения — соврать в аргументе значит получить 42501, а не расширить себе права.
CREATE OR REPLACE FUNCTION app.read_admin_notification_targets(p_context_class text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_telemetry_operator_owner'::name,
    CASE WHEN p_context_class = 'service' THEN 'app_worker'::name ELSE 'app_pre_session'::name END,
    p_context_class::app.port_context_class,
    'notifications.admin-targets.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend(p_context_class))::app.port_typed_arg
    ]),
    'app.read_admin_notification_targets(text)'::regprocedure
  );

  SELECT jsonb_build_object(
    'telegram', COALESCE(jsonb_agg(DISTINCT holder.telegram_id) FILTER (WHERE holder.telegram_id IS NOT NULL), '[]'::jsonb),
    'max', COALESCE(jsonb_agg(DISTINCT holder.max_id) FILTER (WHERE holder.max_id IS NOT NULL), '[]'::jsonb),
    'sms', COALESCE(jsonb_agg(DISTINCT holder.phone) FILTER (WHERE holder.phone IS NOT NULL), '[]'::jsonb),
    'email', COALESCE(jsonb_agg(DISTINCT holder.email) FILTER (WHERE holder.email IS NOT NULL), '[]'::jsonb)
  )
  INTO v_result
  FROM (
    SELECT
      NULLIF(btrim((
        SELECT contact.value_normalized FROM public.user_contacts AS contact
        WHERE contact.platform_user_id = admin_user.id
          AND contact.contact_kind = 'phone' AND contact.is_primary = true
        LIMIT 1
      )), '') AS phone,
      NULLIF(btrim((
        SELECT contact.value_normalized FROM public.user_contacts AS contact
        WHERE contact.platform_user_id = admin_user.id
          AND contact.contact_kind = 'email' AND contact.is_primary = true
        LIMIT 1
      )), '') AS email,
      NULLIF(btrim((
        SELECT binding.external_id FROM public.user_channel_bindings AS binding
        WHERE binding.user_id = admin_user.id AND binding.channel_code = 'telegram'
        LIMIT 1
      )), '') AS telegram_id,
      NULLIF(btrim((
        SELECT binding.external_id FROM public.user_channel_bindings AS binding
        WHERE binding.user_id = admin_user.id AND binding.channel_code = 'max'
        LIMIT 1
      )), '') AS max_id
    FROM public.platform_users AS admin_user
    WHERE admin_user.role = 'admin'
      AND admin_user.merged_into_id IS NULL
      AND admin_user.is_archived = false
  ) AS holder;

  RETURN COALESCE(v_result, jsonb_build_object(
    'telegram', '[]'::jsonb, 'max', '[]'::jsonb, 'sms', '[]'::jsonb, 'email', '[]'::jsonb
  ));
END
$function$;
