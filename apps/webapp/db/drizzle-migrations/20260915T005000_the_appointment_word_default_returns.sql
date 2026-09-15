-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'appointment_label' AND scope = 'doctor' AND organization_id IS NULL)
--
-- Кабинет клиента на TEST и на новом проде падал целиком: `runtime_setting_unavailable:appointment_label`
-- (владелец 15.09.2026 прислал экран «Не удалось загрузить раздел», код 3711425059). Причина не в коде.
--
-- Платформенную строку слова о событии записи заводит миграция
-- `20260912T012000_the_organization_names_the_appointment_word`, но на цели переезда (prod-to-target)
-- её тег был заранее записан в журнал `drizzle.__drizzle_migrations` артефактом
-- `deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql`, а сама миграция не исполнялась.
-- Тело функции `app.read_authenticated_runtime_setting` приехало вместе со сгенерированной схемой —
-- поэтому ключ в allowlist есть, — а вот data-only вставка сгенерированной схемой не покрывается:
-- baseline заполняет глобальные ключи реестра области `admin`, а этот ключ имеет scope `doctor`.
-- Итог: дверь открыта, значения за ней нет, reader (`required()`) валит и `/app/patient`, и любые
-- страницы, читающие слово. Замерено 15.09 на обеих базах: строк с этим ключом ноль.
--
-- Отсутствующая строка значением не является (решение 12.09) — поэтому чинится ДАННОЕ, а не читатель:
-- reader по-прежнему обязан отказывать, если платформа не сказала своё слово.
--
-- Rights analysis: data-only вставка в существующий корень public.system_settings. Объекты, функции,
-- роли и привилегии не затрагиваются; уже сохранённое значение организации и платформы не
-- перезаписывается (ON CONFLICT DO NOTHING).
INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
VALUES ('appointment_label', 'doctor', NULL, pg_catalog.jsonb_build_object('value', 'приём'), statement_timestamp(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;
