# D17 — права владельцев SECURITY DEFINER-швов

Дата замера: 2026-08-23. Источник оракула: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D17 — «узкая роль интегратора не мешает доставке».

## Итог

В текущей декларации 43 роли `app_seam_*_owner` владеют 43 группами из 1–54 SECURITY DEFINER-корней. Перепись нашла ровно два неполных требования, оба у `app_seam_delivery_scope_owner`: `SELECT` на `public.user_contacts` отсутствовал как table grant, а на `public.user_channel_preferences` был только column grant. Ни одна из 43 ролей не получает права через членство.

Исправление находится только в `deploy/postgres/privileges/declaration.ts`: двум читаемым отношениям назначен table-level `SELECT`, а generated artifacts пересобраны. Миграции не менялись. В теле `app.read_integrator_delivery_target_snapshot` осталась арендная стена: принятая организация берётся из контекста, аргумент только сверяется, затем проверяется активное членство пользователя в этой организации.

## Воспроизводимый метод переписи

Команда полного отчёта по каждому владельцу, его корням, отношениям чтения/записи, прямым/унаследованным правам и разрывам:

```bash
node deploy/postgres/privileges/seam-owner-access-census.mjs --db bcb_webapp_dev
```

Метод:

1. Ожидаемая матрица берётся из `declaration.portContext.functions`: только SECURITY DEFINER-корни с владельцем `app_seam_*_owner`; relation/operation/column surfaces независимо проверяет `function-census.test.mjs` по телам функций.
2. Прямые table ACL читаются из `pg_class.relacl` через `aclexplode`; прямые column ACL — из `pg_attribute.attacl`. Поэтому пустой `information_schema.role_table_grants` сам по себе не доказывает отсутствие column grants.
3. Членства обходятся рекурсивно по `pg_auth_members` с учётом `inherit_option`; effective ACL проверяются `has_table_privilege` и `has_column_privilege`.
4. Каждое требование получает один статус: `owned`, `direct-table`, `direct-columns`, `inherited`, `partial` или `missing`. `partial` означает, что часть ACL существует, но не удовлетворяет объявленному table-level требованию.

Команда `node deploy/postgres/privileges/seam-owner-access-census.mjs --db bcb_webapp_dev | tail -3` дала:

```text
owners=43
requirements=631
missing_or_partial=2
```

Число 43 отличается от живого TEST-замера 34 из брифа: перепись выполнена по текущей ветке и текущей DEV-декларации; TEST не трогался.

## Перепись по владельцам

Полные relation mappings (reads и writes со статусом каждого отношения) печатает команда выше. Здесь компактный индекс всех владельцев: число корней, пути членства и число неполных relation/operation requirements.

| owner | roots | memberships | missing/partial |
|---|---:|---|---:|
| app_seam_catalog_admin_owner | 1 | none | 0 |
| app_seam_catalog_public_owner | 2 | none | 0 |
| app_seam_context_owner | 4 | none | 0 |
| app_seam_dedicated_bot_owner | 2 | none | 0 |
| app_seam_delivery_scope_owner | 16 | none | 2 |
| app_seam_email_otp_owner | 25 | none | 0 |
| app_seam_identity_lookup_owner | 16 | none | 0 |
| app_seam_login_token_owner | 5 | none | 0 |
| app_seam_oauth_owner | 5 | none | 0 |
| app_seam_org_commerce_owner | 10 | none | 0 |
| app_seam_org_directory_owner | 3 | none | 0 |
| app_seam_org_invite_owner | 2 | none | 0 |
| app_seam_passkey_owner | 9 | none | 0 |
| app_seam_password_auth_owner | 16 | none | 0 |
| app_seam_patient_booking_owner | 34 | none | 0 |
| app_seam_patient_invite_owner | 7 | none | 0 |
| app_seam_patient_lfk_media_owner | 12 | none | 0 |
| app_seam_patient_org_projection_owner | 4 | none | 0 |
| app_seam_patient_program_resolver_owner | 2 | none | 0 |
| app_seam_patient_self_actions_owner | 54 | none | 0 |
| app_seam_payment_webhook_owner | 9 | none | 0 |
| app_seam_phone_binding_owner | 11 | none | 0 |
| app_seam_phone_otp_owner | 11 | none | 0 |
| app_seam_platform_analytics_owner | 3 | none | 0 |
| app_seam_public_booking_owner | 7 | none | 0 |
| app_seam_public_clinic_card_owner | 2 | none | 0 |
| app_seam_public_slug_owner | 5 | none | 0 |
| app_seam_reminder_appointment_owner | 2 | none | 0 |
| app_seam_reminder_email_cooldown_owner | 2 | none | 0 |
| app_seam_reminder_materialization_owner | 10 | none | 0 |
| app_seam_reminder_patient_owner | 11 | none | 0 |
| app_seam_reminder_specialist_owner | 7 | none | 0 |
| app_seam_retention_sweep_owner | 1 | none | 0 |
| app_seam_self_security_owner | 2 | none | 0 |
| app_seam_settings_integrator_owner | 10 | none | 0 |
| app_seam_settings_preauth_owner | 7 | none | 0 |
| app_seam_settings_runtime_owner | 7 | none | 0 |
| app_seam_specialist_provision_owner | 10 | none | 0 |
| app_seam_staff_security_owner | 11 | none | 0 |
| app_seam_telemetry_exclusion_owner | 3 | none | 0 |
| app_seam_telemetry_media_owner | 2 | none | 0 |
| app_seam_telemetry_operator_owner | 24 | none | 0 |
| app_seam_telemetry_patient_owner | 2 | none | 0 |

## Два найденных разрыва и исправление

Оба отношения читает `app.read_integrator_delivery_target_snapshot(uuid,text,text,text,uuid,bigint,text,timestamp with time zone)`, владелец — `app_seam_delivery_scope_owner`.

- `public.user_contacts`: корень читает `platform_user_id`, `contact_kind`, `value_normalized`, `confirmed_at`, `is_primary` и выполняет `count(*)`; до исправления у владельца был column-level `SELECT` только на `contact_kind`, `platform_user_id`, `value_normalized`. Generated результат: `GRANT SELECT ON TABLE public.user_contacts TO app_seam_delivery_scope_owner`.
- `public.user_channel_preferences`: корень читает `platform_user_id`, `channel_code`, `is_enabled_for_messages`, `is_enabled_for_notifications`, `is_preferred_for_auth`; до исправления существовал только column-level `SELECT`. Generated результат: `GRANT SELECT ON TABLE public.user_channel_preferences TO app_seam_delivery_scope_owner`.

Других missing/partial требований в текущей DEV-переписи нет. Права записи не добавлялись. Роли, членства, политики и тела функций не менялись.

## Поведенческое доказательство

`RUN_D17_SEAM_OWNER_DB=1 node --test deploy/postgres/privileges/seam-owner-delivery-target.devDbProof.test.mjs` выполняет rollback-only транзакцию на именованной DEV-БД:

- берёт реально существующего пользователя с активным `org_enrollments`;
- устанавливает принятый tenant-service context и вызывает настоящий корень под `SET LOCAL ROLE app_tenant_service`;
- применяет ровно две строки `GRANT SELECT`, извлечённые из generated artifact, и получает JSON snapshot с `"ok"`;
- независимо отзывает право на `user_contacts` и `user_channel_preferences`; каждый вызов краснеет с SQLSTATE `42501`;
- откатывает всю транзакцию.

Результат: 1 test, 1 pass. Инъекция обязательного нового права доказана для обоих отношений.

## Проверки

- `node deploy/postgres/privileges/generate-cli.mjs --all --check` — generated privileges и allowlists совпадают побайтно.
- `node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only --check` — port-context artifacts совпадают побайтно.
- `node --test deploy/postgres/privileges/relation-access.test.mjs deploy/postgres/privileges/function-census.test.mjs` — 57/57.
- `node --test deploy/postgres/privileges/definer-tenant-predicate.test.mjs` — 14/14, включая живую инъекцию арендного предиката.
- `pnpm typecheck` — зелёный.
- `pnpm lint` — exit 0; две существующие warning в `AppointmentPaymentSection.tsx`, ошибок нет.

`--execute`, TEST, PROD и push не выполнялись; галочки плана не менялись. Живая выкатка и повторная запись на TEST остаются ведущему.
