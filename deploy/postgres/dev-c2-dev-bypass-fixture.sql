-- DEV ONLY. Фикстура дев-входа: учётка, привязка канала и членство в организации.
--
-- Зачем файл существует: дев-вход (`/api/auth/dev-bypass?token=dev:doctor`) требует, чтобы в базе
-- лежал пользователь с телефоном пресета — иначе вход МОЛЧА редиректит на страницу входа, без
-- ошибки в логе. А кабинет врача сверх того требует активного членства в организации со
-- специалистом — иначе `/app/doctor` уводит на `/app/account`. Оба ряда однажды уже пропали при
-- пересборке dev-базы из дампа прода, и оба отказа молчаливые: полчаса уходит на то, чтобы понять,
-- что сломан не код. Поэтому фикстура живёт скриптом, а не разовыми командами в базу.
--
-- ⛔ Только dev. На TEST у фикстур свой источник (`seed-saas-test-walkthrough-fixtures.ts`),
-- на проде дев-вход выключен и этот скрипт не применяется никогда.
--
-- Применение:  sudo -u postgres psql -d bcb_webapp_dev -f dev-c2-dev-bypass-fixture.sql
-- Скрипт идемпотентный: повторный прогон ничего не ломает и не плодит.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_user_id   uuid := '00000000-0000-0000-0000-000000000002';
  v_org_id    uuid;
  v_spec_id   uuid;
  v_isolated_org_id uuid := 'e0000000-0000-4000-8000-000000000001';
  v_isolated_spec_id uuid := 'e1000000-0000-4000-8000-000000000001';
  v_colleague_spec_id uuid := 'e1000000-0000-4000-8000-000000000002';
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'этот скрипт только для dev-базы, текущая: %', current_database();
  END IF;

  -- Remove the first revision of the four new DEV identities. Those identifiers looked UUID-like
  -- but were nil-version values rejected by the same route validation used for real patient cards.
  DELETE FROM support_conversation_messages
   WHERE conversation_id IN (
     'e2000000-0000-4000-8000-000000000001'::uuid,
     'e2000000-0000-4000-8000-000000000002'::uuid
   );
  DELETE FROM support_conversations
   WHERE id IN (
     'e2000000-0000-4000-8000-000000000001'::uuid,
     'e2000000-0000-4000-8000-000000000002'::uuid
   );
  DELETE FROM platform_users
   WHERE id IN (
     '00000000-0000-0000-0000-000000000005'::uuid,
     '00000000-0000-0000-0000-000000000006'::uuid,
     '00000000-0000-0000-0000-000000000007'::uuid,
     '00000000-0000-0000-0000-000000000008'::uuid
   );

  -- 1. Учётки всех пресетов дев-входа. Телефон обязан совпасть с телефоном пресета в коде
  --    (`devBypassPresetPhoneMatches`), иначе вход молча откажет — без ошибки, просто редирект.
  --    Значения взяты из `apps/webapp/src/modules/auth/service.ts`, блок `presets`.
  INSERT INTO platform_users (id, display_name, phone_normalized, role) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Demo Client',      '+79990000001', 'client'),
    ('00000000-0000-0000-0000-000000000002', 'Demo Doctor',      '+79990000002', 'doctor'),
    ('00000000-0000-0000-0000-000000000003', 'Demo Admin',       '+79990000003', 'admin'),
    ('00000000-0000-0000-0000-000000000004', 'Demo Clinic Owner','+79990000004', 'doctor'),
    ('d0000000-0000-4000-8000-000000000005', 'Demo Isolated Doctor', '+79990000005', 'doctor'),
    ('d0000000-0000-4000-8000-000000000006', 'Demo Isolated Patient','+79990000006', 'client'),
    ('d0000000-0000-4000-8000-000000000007', 'Demo Colleague Doctor', '+79990000007', 'doctor'),
    ('d0000000-0000-4000-8000-000000000008', 'Demo Colleague Patient','+79990000008', 'client')
  ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        phone_normalized = EXCLUDED.phone_normalized,
        role = EXCLUDED.role;

  -- 2. Привязки каналов: обмен дев-токена идёт через поиск учётки по привязке, а не по телефону.
  INSERT INTO user_channel_bindings (user_id, channel_code, external_id) VALUES
    ('00000000-0000-0000-0000-000000000001', 'telegram', '111111111'),
    ('00000000-0000-0000-0000-000000000002', 'telegram', '222222222'),
    ('00000000-0000-0000-0000-000000000003', 'telegram', '333333333'),
    ('00000000-0000-0000-0000-000000000004', 'telegram', '999999999999004'),
    ('d0000000-0000-4000-8000-000000000005', 'telegram', '999999999999005'),
    ('d0000000-0000-4000-8000-000000000006', 'telegram', '999999999999006'),
    ('d0000000-0000-4000-8000-000000000007', 'telegram', '999999999999007'),
    ('d0000000-0000-4000-8000-000000000008', 'telegram', '999999999999008')
  ON CONFLICT DO NOTHING;

  INSERT INTO user_identity (platform_user_id, display_name) VALUES
    ('d0000000-0000-4000-8000-000000000005', 'Demo Isolated Doctor'),
    ('d0000000-0000-4000-8000-000000000006', 'Demo Isolated Patient'),
    ('d0000000-0000-4000-8000-000000000007', 'Demo Colleague Doctor'),
    ('d0000000-0000-4000-8000-000000000008', 'Demo Colleague Patient')
  ON CONFLICT (platform_user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        updated_at = now();

  INSERT INTO user_contacts
    (platform_user_id, contact_kind, value_normalized, is_primary, source_origin)
  VALUES
    ('d0000000-0000-4000-8000-000000000005', 'phone', '+79990000005', true, 'platform_users'),
    ('d0000000-0000-4000-8000-000000000006', 'phone', '+79990000006', true, 'platform_users'),
    ('d0000000-0000-4000-8000-000000000007', 'phone', '+79990000007', true, 'platform_users'),
    ('d0000000-0000-4000-8000-000000000008', 'phone', '+79990000008', true, 'platform_users')
  ON CONFLICT DO NOTHING;

  -- 3. Членство в организации со специалистом. Берём первую активную организацию, у которой есть
  --    активный специалист: кабинет должен показывать ЖИВЫЕ данные dev-базы, а не пустые экраны
  --    нового пустого специалиста. Роль `doctor` + непустой `specialist_id` — ровно то, чего
  --    требует доступ к клиническому рабочему месту.
  SELECT s.organization_id, s.id
    INTO v_org_id, v_spec_id
    FROM be_specialists s
    JOIN be_organizations o ON o.id = s.organization_id
   WHERE s.is_active AND o.is_active
   ORDER BY s.created_at
   LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'в dev-базе нет активной организации с активным специалистом — кабинет открыть нечем';
  END IF;

  -- Изолированный режим: отдельная организация со своим врачом и пациентом.
  INSERT INTO be_organizations (id, title, is_active, tariff_id)
  VALUES (
    v_isolated_org_id,
    'DEV Isolated Clinic',
    true,
    (SELECT tariff_id FROM be_organizations WHERE id = v_org_id)
  )
  ON CONFLICT (id) DO UPDATE
    SET title = EXCLUDED.title,
        is_active = true,
        tariff_id = EXCLUDED.tariff_id,
        updated_at = now();

  INSERT INTO be_specialists (id, organization_id, full_name, is_active)
  VALUES
    (v_isolated_spec_id, v_isolated_org_id, 'Demo Isolated Doctor', true),
    (v_colleague_spec_id, v_org_id, 'Demo Colleague Doctor', true)
  ON CONFLICT (id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        full_name = EXCLUDED.full_name,
        is_active = true,
        updated_at = now();

  -- Отдельная клиника должна быть доступна для долгого DEV-прохода, а не блокироваться как
  -- коммерчески не настроенная. Это синтетический активный trial только в dev-базе.
  INSERT INTO saas_organization_trials
    (id, organization_id, tariff_id, started_at, ends_at, discount_ends_at,
     post_trial_behavior, post_trial_tariff_id, status)
  VALUES
    ('e4000000-0000-4000-8000-000000000001', v_isolated_org_id,
     (SELECT tariff_id FROM be_organizations WHERE id = v_isolated_org_id),
     now() - interval '1 day', now() + interval '365 days', now() + interval '395 days',
     'read_only', NULL, 'active')
  ON CONFLICT (organization_id) DO UPDATE
    SET tariff_id = EXCLUDED.tariff_id,
        started_at = EXCLUDED.started_at,
        ends_at = EXCLUDED.ends_at,
        discount_ends_at = EXCLUDED.discount_ends_at,
        post_trial_behavior = EXCLUDED.post_trial_behavior,
        post_trial_tariff_id = NULL,
        status = 'active',
        updated_at = now();

  -- The source DEV tariff predates the patient-home mechanic and therefore carries no explicit
  -- value for it. Keep production tariff data untouched; only the two walkthrough clinics get a
  -- DEV-scoped override so both existing-clinic and isolated-clinic patient home paths are testable.
  INSERT INTO saas_org_entitlement_overrides (organization_id, mechanic, enabled)
  VALUES
    (v_org_id, 'patient_home_today', true),
    (v_isolated_org_id, 'patient_home_today', true)
  ON CONFLICT (organization_id, mechanic) DO UPDATE
    SET enabled = true,
        expires_at = NULL,
        updated_at = now();

  -- Один staff-login принадлежит ровно одной клинике. Старые DEV-факты от прежних fixture runs
  -- сохраняем как историю, но они не могут оставаться вторым active membership.
  UPDATE be_organization_members
     SET status = 'disabled', updated_at = now()
   WHERE platform_user_id IN (
           '00000000-0000-0000-0000-000000000002'::uuid,
           '00000000-0000-0000-0000-000000000004'::uuid,
           'd0000000-0000-4000-8000-000000000007'::uuid
         )
     AND organization_id <> v_org_id
     AND status = 'active';

  UPDATE be_organization_members
     SET status = 'disabled', updated_at = now()
   WHERE platform_user_id = 'd0000000-0000-4000-8000-000000000005'::uuid
     AND organization_id <> v_isolated_org_id
     AND status = 'active';

  INSERT INTO be_organization_members (organization_id, platform_user_id, role, specialist_id, status)
  VALUES (v_org_id, v_user_id, 'doctor', v_spec_id, 'active')
  ON CONFLICT (organization_id, platform_user_id) DO UPDATE
    SET role = EXCLUDED.role,
        specialist_id = EXCLUDED.specialist_id,
        status = EXCLUDED.status,
        updated_at = now();

  INSERT INTO be_organization_members
    (organization_id, platform_user_id, role, specialist_id, status)
  VALUES
    (v_isolated_org_id, 'd0000000-0000-4000-8000-000000000005', 'doctor', v_isolated_spec_id, 'active'),
    (v_org_id, 'd0000000-0000-4000-8000-000000000007', 'doctor', v_colleague_spec_id, 'active')
  ON CONFLICT (organization_id, platform_user_id) DO UPDATE
    SET role = EXCLUDED.role,
        specialist_id = EXCLUDED.specialist_id,
        status = EXCLUDED.status,
        updated_at = now();

  -- 4. Владелец клиники (пресет `dev:clinic-admin`) — членство с ролью `owner` в той же организации.
  --    Без него настройки организации (в том числе эквайринг) править некому: у роли `doctor` прав на
  --    них нет, а глобальный администратор организации не имеет вовсе. Автосоздание рабочего места
  --    (`ensureDevBypassStaffWorkspace`) в запертом режиме дев-входа не срабатывает.
  INSERT INTO be_organization_members (organization_id, platform_user_id, role, specialist_id, status)
  VALUES (v_org_id, '00000000-0000-0000-0000-000000000004', 'owner', NULL, 'active')
  ON CONFLICT (organization_id, platform_user_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = now();

  -- 5. Пациент (пресет `dev:client`) должен быть записан в ту же организацию: пациентские пути
  --    (каталог, покупка, оплата) начинаются с поиска активной записи в клинику и без неё отвечают
  --    `no_active_enrollment`.
  INSERT INTO org_enrollments (organization_id, platform_user_id, status)
  VALUES
    (v_org_id, '00000000-0000-0000-0000-000000000001', 'active'),
    (v_isolated_org_id, 'd0000000-0000-4000-8000-000000000006', 'active'),
    (v_org_id, 'd0000000-0000-4000-8000-000000000008', 'active')
  ON CONFLICT (organization_id, platform_user_id) DO UPDATE
    SET status = EXCLUDED.status;

  -- Положительные пары для двух независимых стен безопасности.
  INSERT INTO patient_specialist_links
    (organization_id, patient_user_id, specialist_id, status, created_via)
  VALUES
    (v_isolated_org_id, 'd0000000-0000-4000-8000-000000000006', v_isolated_spec_id, 'active', 'manual_assign'),
    (v_org_id, 'd0000000-0000-4000-8000-000000000008', v_colleague_spec_id, 'active', 'manual_assign')
  ON CONFLICT DO NOTHING;

  INSERT INTO support_conversations
    (id, organization_id, integrator_conversation_id, platform_user_id, source, admin_scope,
     status, opened_at, last_message_at)
  VALUES
    ('e2000000-0000-4000-8000-000000000001', v_isolated_org_id,
     'webapp:organization:' || v_isolated_org_id::text || ':platform:d0000000-0000-4000-8000-000000000006',
     'd0000000-0000-4000-8000-000000000006', 'webapp', 'support', 'open', now(), now()),
    ('e2000000-0000-4000-8000-000000000002', v_org_id,
     'webapp:organization:' || v_org_id::text || ':platform:d0000000-0000-4000-8000-000000000008',
     'd0000000-0000-4000-8000-000000000008', 'webapp', 'support', 'open', now(), now())
  ON CONFLICT (id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        platform_user_id = EXCLUDED.platform_user_id,
        status = 'open',
        last_message_at = now(),
        updated_at = now();

  INSERT INTO support_conversation_messages
    (id, organization_id, integrator_message_id, conversation_id, sender_role, message_type, text, source, created_at)
  VALUES
    ('e3000000-0000-4000-8000-000000000001', v_isolated_org_id, 'dev-isolated-patient-message',
     'e2000000-0000-4000-8000-000000000001', 'user', 'text', 'isolated patient message', 'webapp', now()),
    ('e3000000-0000-4000-8000-000000000002', v_org_id, 'dev-colleague-patient-message',
     'e2000000-0000-4000-8000-000000000002', 'user', 'text', 'colleague patient message', 'webapp', now())
  ON CONFLICT (id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id;

  RAISE NOTICE 'дев-врач % привязан к организации % специалистом %', v_user_id, v_org_id, v_spec_id;
END
$$;
