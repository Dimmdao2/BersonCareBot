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
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'этот скрипт только для dev-базы, текущая: %', current_database();
  END IF;

  -- 1. Учётка дев-врача. Телефон обязан совпасть с телефоном пресета в коде дев-входа
  --    (`devBypassPresetPhoneMatches`), иначе вход молча откажет.
  INSERT INTO platform_users (id, display_name, phone_normalized, role)
  VALUES (v_user_id, 'Demo Doctor', '+79990000002', 'doctor')
  ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        phone_normalized = EXCLUDED.phone_normalized,
        role = EXCLUDED.role;

  -- 2. Привязка канала: обмен дев-токена идёт через поиск учётки по привязке, а не по телефону.
  INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
  VALUES (v_user_id, 'telegram', '222222222')
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

  INSERT INTO be_organization_members (organization_id, platform_user_id, role, specialist_id, status)
  VALUES (v_org_id, v_user_id, 'doctor', v_spec_id, 'active')
  ON CONFLICT (organization_id, platform_user_id) DO UPDATE
    SET role = EXCLUDED.role,
        specialist_id = EXCLUDED.specialist_id,
        status = EXCLUDED.status,
        updated_at = now();

  RAISE NOTICE 'дев-врач % привязан к организации % специалистом %', v_user_id, v_org_id, v_spec_id;
END
$$;
