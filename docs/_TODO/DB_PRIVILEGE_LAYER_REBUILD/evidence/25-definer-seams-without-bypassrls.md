# Ф3 — definer-швы без `BYPASSRLS`

Дата снимка: 2026-08-09. Среда: только live DEV `bcb_webapp_dev`, только `BEGIN TRANSACTION READ ONLY`; DDL/DML не выполнялись. Это проект и SQL-эскизы, не исполняемый scope.

## Коротко для владельца

`app_owner` надо заменить не одним новым «сильным владельцем», а **35 владельцами 35 швов**. У каждого владельца `NOLOGIN NOBYPASSRLS`, нет членов и есть только колоночные ACL на таблицы своего шва. Каталог DEV подтверждает: сейчас `app_owner` владеет 132 `SECURITY DEFINER` функциями и имеет `rolbypassrls=true`; ещё один постоянный обход есть у `saas_system_health_owner`. [Q1][Q9]

После разреза ни одна функция чтения passkey, OTP, reminder, биллинга или телеметрии не получает власть соседнего шва. На таблицах с `FORCE ROW LEVEL SECURITY` доступ владельца функции даёт явная политика `TO app_seam_*_owner`; эта политика видна в `pg_policy` и попадает в двустороннюю сверку. Для контекстных операций предикат совпадает с подписанными `organization_id`/`patient_user_id`. Для настоящего pre-session или worker lookup, где контекста ещё нет по определению, честный минимум — `USING (true)` **только на конкретной таблице и только для конкретного NOLOGIN-владельца**, дополнительно ограниченный колоночным `GRANT` и неизменяемым телом функции. [Q2][Q3][Q4]

**Ни одной из 132 функций `BYPASSRLS` не нужен.** Отдельный остаточный случай — системное здоровье: ему действительно нужны кросс-арендные агрегаты, но это решается `USING (true)` на его поимённых диагностических таблицах; `saas_system_health_owner` остаётся тем же владельцем, но становится `NOBYPASSRLS`. [Q1][Q8]

## Граница доказанного

- Числа и тела ниже сняты командами Q0–Q8. Q3 прочитал `pg_get_functiondef()` всех 132 функций и сопоставил каждое прямое упоминание отношения; Q4 сопоставил названные в body колонки с `pg_attribute`. [Q2][Q3][Q4]
- Операции `R/I/U/D` означают `SELECT/INSERT/UPDATE/DELETE`. Колонки — доказанный лексический верхний предел по текущим body, а не готовое разрешение «выдать всё». Общие имена (`id`, `status`, `organization_id`, `updated_at`) при нескольких таблицах могут относиться не к каждой из них; поэтому точный SQL ниже дан для одной вручную прочитанной representative-функции каждого шва. Для остальных неоднозначных колонок правило — **не выдавать до красного live-отказа Ф7**. [Q3][Q4]
- 88 definer-функций, которыми владеет login-мигратор `bcb_webapp_dev_user`, — отдельный drift. Они не присоединены к этим 132 и не «размазаны» по владельцам без классификации. [Q1]
- 25 из 132 функций сейчас имеют `EXECUTE` для `PUBLIC`; это не основание дать `PUBLIC` доступ к таблицам. Этот function ACL должен быть отдельно подтверждён или отозван при применении, но решение о его составе отсутствует в Ф3. [Q5]

## Census: 132 функции → 35 швов

В каждой строке `owner` — новый NOLOGIN-владелец. Причина не выдавать доступ caller напрямую одинакова: caller получил бы произвольный SQL над чувствительными строками/секретами, тогда как функция фиксирует входы, предикат, возвращаемые колонки и атомарность. Дополнительная причина шва указана после поверхности. Полный список ровно из 132 имён получен Q2; сумма строк — 132. [Q2]

### 01. Подписанный контекст — `app_seam_context_owner` (6)

Функции: `current_integrator_user_id`, `current_org_id`, `current_patient_user_id`, `install_signed_context`, `release_principal_context`, `reset_principal_context`.

Поверхность: `app.context_nonce_ledger I(nonce, backend_pid, expires_epoch)`; `app.context_signing_secrets R(id, secret)`; `app.principal_context RID(backend_pid, org_id, patient_user_id, integrator_user_id, nonce, expires_epoch, installed_at)`. Прямой доступ разрушил бы единственную точку проверки подписи и позволил бы подменять tenant/patient context. [Q3][Q4]

### 02. Парольный вход — `app_seam_password_auth_owner` (9)

Функции: `email_password_delete_unverified_registration`, `email_password_find_login_candidate`, `email_password_register_pending`, `password_credentials_replace_self`, `password_credentials_upsert_self`, `password_login_acquire`, `password_login_complete`, `password_login_issue_altcha_challenge`, `password_login_read_altcha_secret`.

Поверхность: `password_altcha_challenges RIUD(challenge_id, identifier_key, purpose, challenge_digest, expires_at, consumed_at)`; `password_login_identifier_protection RIUD(identifier_key, failed_attempts, next_allowed_at, locked_until, verification_lease_token, verification_lease_until, leased_user_id, updated_at)`; `platform_users RID(id, role, first_name, last_name, patronymic, email, email_normalized, email_verified_at, merged_into_id, display_name, updated_at)`; `user_password_credentials RIU(user_id, password_hash, failed_attempts, locked_until, next_allowed_at, verification_lease_token, verification_lease_until, updated_at)`; `system_settings R(key, scope, organization_id, value_json)` только для ALTCHA-secret. Caller нельзя давать хеши паролей и таблицы rate-limit. [Q3][Q4]

### 03. Email OTP — `app_seam_email_otp_owner` (8)

Функции: `email_auth_enqueue_otp_delivery`, `email_auth_set_email_challenge_delivery_code`, `email_auth_verify_user_email`, `email_otp_public_consume_latest_challenge`, `email_otp_public_delete_unverified_registration`, `email_otp_public_find_or_create_user`, `email_otp_public_find_user_by_email`, `email_otp_public_register_patient`.

Поверхность: `email_challenges RUD(id, user_id, email, code_hash, expires_at, attempts, purpose, pending_delivery_code, delivery_token, delivery_claimed_at, created_at)`; `email_send_cooldowns RI(user_id, email_normalized, last_sent_at)`; `outgoing_delivery_queue I(id, event_id, kind, channel, payload_json, status, attempt_count, max_attempts, next_retry_at, organization_id, priority)`; `platform_users RIUD(id, role, first_name, last_name, patronymic, display_name, email, email_normalized, email_verified_at, merged_into_id, created_at, updated_at)`. Caller не должен читать OTP-хеш или произвольно подтверждать email. [Q3][Q4]

### 04. Passkey — `app_seam_passkey_owner` (9)

Функции: `passkey_complete_authentication`, `passkey_complete_registration`, `passkey_delete_current_credential`, `passkey_get_or_create_account`, `passkey_issue_challenge`, `passkey_list_current_credentials`, `passkey_list_current_exclusions`, `passkey_read_challenge`, `passkey_read_credential`.

Поверхность: `user_passkey_accounts RI(user_id, user_handle)`; `user_passkey_challenges RIUD(id, purpose, user_id, challenge, expected_origin, rp_id, expires_at, consumed_at)`; `user_passkey_credentials RIUD(credential_id, user_id, public_key, counter, transports, device_type, backed_up, created_at, last_used_at)`. Caller нельзя давать cross-user lookup credential/challenge. [Q3][Q4]

### 05. Привязка телефона/канала — `app_seam_phone_binding_owner` (3)

Функции: `auth_phone_bind_lock_channel_binding`, `auth_phone_bind_upsert_channel_binding`, `close_active_user_phone_history`.

Поверхность: `user_channel_bindings RI(user_id, channel_code, external_id)`; `user_phone_history U(platform_user_id, valid_to)`. Функции удерживают уникальность привязки и закрывают только активный interval. [Q3][Q4]

### 06. Self-security/session epoch — `app_seam_self_security_owner` (4)

Функции: `auth_user_pin_read_self`, `auth_user_pin_upsert_self`, `bump_platform_user_session_epoch_self`, `propagate_staff_session_version_to_session_epoch`.

Поверхность: `user_pins RI(user_id, pin_hash, attempts_failed, locked_until, updated_at)`; `platform_users U(id, session_epoch, updated_at)`. Caller нельзя выдавать PIN-хеши или массовое изменение session epoch. [Q3][Q4]

### 07. Предсессионный identity lookup — `app_seam_identity_lookup_owner` (2)

Функции: `find_platform_user_ids_by_any_confirmed_email`, `get_preferred_auth_channel_code`.

Поверхность: `platform_users R(id, email, merged_into_id)`; `user_contacts R(platform_user_id, contact_kind, value_normalized, is_primary, confirmed_at)`; `user_channel_preferences R(user_id, platform_user_id, channel_code, is_preferred_for_auth)`. Это cross-user lookup до сессии; наружу должен выходить только ID/предпочтённый канал, не адресная книга. [Q3][Q4]

### 08. Patient invite — `app_seam_patient_invite_owner` (7)

Функции: `cancel_patient_invite_email_proof`, `claim_unbound_patient_invite_email`, `exchange_patient_invite`, `lookup_patient_invite_continuation`, `redeem_patient_invite_email`, `start_patient_invite_email_proof`, `verify_patient_invite_email_proof`.

Поверхность: `app.context_signing_secrets R(id, secret)`; `be_organizations R(id, title, is_active, updated_at)`; `org_enrollments RU(id, organization_id, platform_user_id, status, portal_activated_at, portal_activated_via)`; `patient_invites RU(id, organization_id, patient_user_id, enrollment_id, token_hash, status, invited_email_normalized, expires_at, accepted_by_platform_user_id, accepted_via, bearer_exchanged_at, continuation_hash, continuation_expires_at, proof_email_normalized, proof_code_hash, proof_started_at, proof_expires_at, proof_attempts, proof_verified_at, updated_at, accepted_at, recipient_binding)`; `patient_merge_candidates I(id, organization_id, anchor_user_id, candidate_user_id, reason, status, payload)`; `platform_users RU(id, role, email, email_normalized, email_verified_at, merged_into_id, updated_at)`. Caller нельзя давать bearer/proof hashes и межпользовательский merge-write. [Q3][Q4]

### 09. Staff organization invite — `app_seam_org_invite_owner` (2)

Функции: `accept_org_invite`, `lookup_pending_org_invite`.

Поверхность: `principal_context R(backend_pid)`; `organization_member_invites RU(id, organization_id, invited_email, invited_role, token_hash, status, expires_at, created_by_platform_user_id, accepted_by_platform_user_id, accepted_membership_id, created_at, accepted_at)`; `be_organization_members RI(id, organization_id, platform_user_id, role, specialist_id, status, created_at, updated_at)`; `be_organizations R(id, title, tariff_id, created_at, updated_at)`; `platform_users RU(id, display_name, role, email, email_normalized, email_verified_at, merged_into_id, created_at, updated_at)`; `saas_tariffs R(id, mechanics, included_seats, additional_seat_price_minor)`; `saas_org_entitlement_overrides R(organization_id, mechanic, enabled, seat_limit_override, expires_at)`. Caller не должен сам назначать membership role. [Q3][Q4]

### 10. Specialist/first-organization provisioning — `app_seam_specialist_provision_owner` (5)

Функции: `choose_organization_first_tariff`, `current_provisioned_owner_organization`, `provision_specialist_owner`, `seed_reference_catalog_after_organization_insert`, `seed_reference_catalog_snapshot`.

Поверхность: `specialist_signup_intents RU`; `platform_users RU`; `be_organizations RIU`; `be_organization_members RIU`; `be_specialists I`; `clinic_public_directory_entries I`; `organization_slug_claims I`; `admin_audit_log I`; `saas_billing_accounts I`; `saas_billing_subscriptions I`; `saas_organization_trials RI`; `saas_tariffs R`; `saas_trial_policy R`; `reference_catalog_baselines R(version, definition_json)`; `reference_catalog_snapshot_receipts RI(organization_id, baseline_version)`; `reference_categories RI(organization_id, code, title, is_user_extensible, id)`; `reference_items I(organization_id, category_id, code, title, sort_order, is_active, meta_json)`. Для первых 13 таблиц точный column grant **не доказан** Q4 из-за общих имён и должен выводиться по каждой body перед генератором; выдавать table-level `SELECT *` нельзя. Провижининг атомарно создаёт организацию/владельца/каталог, поэтому прямые INSERT caller-у недопустимы. [Q3][Q4]

### 11–16. Предмаршрутные resolvers

- **11 public slug — `app_seam_public_slug_owner` (2):** `resolve_public_organization_by_slug`, `resolve_public_organization_slug`; `organization_slug_claims R(slug, kind, organization_id)`, `clinic_public_directory_entries R(organization_id, is_published)`, `be_organizations R(id, is_active)`. Честный pre-session cross-tenant lookup. [Q3][Q4]
- **12 public booking — `app_seam_public_booking_owner` (1):** `resolve_public_booking_organization`; `be_branches R(id, organization_id, is_active)`, `be_clinic_services R(id, organization_id, is_active, public_widget_visible, admin_manual_only)`, `be_specialist_service_availability R(id, organization_id, branch_id, service_id, is_active)`, `be_external_entity_mappings R(organization_id, entity_type, canonical_id, metadata)`. Честный pre-session cross-tenant lookup. [Q3][Q4]
- **13 dedicated bot — `app_seam_dedicated_bot_owner` (2):** `resolve_clinic_dedicated_bot_organization`, `sync_clinic_dedicated_bot_binding`; `clinic_dedicated_bot_bindings RID(channel, organization_id, credential_fingerprint, is_active, updated_at)`. Caller не получает credential fingerprint surface. [Q3][Q4]
- **14 payment webhook — `app_seam_payment_webhook_owner` (3):** `read_saas_billing_payment_provider`, `resolve_payment_webhook_organization`, `resolve_saas_billing_invoice_for_webhook`; `be_payment_intents R(organization_id, idempotency_key, provider_id)`, `be_payment_provider_events R(organization_id, provider_id, idempotency_key, event_type)`, `saas_billing_invoices R(id, organization_id, amount_minor, currency, provider_id, provider_invoice_ref)`, `system_settings R(key, scope, organization_id, value_json)`. Lookup идёт до tenant context, но только по provider identifiers. [Q3][Q4]
- **15 delivery scope — `app_seam_delivery_scope_owner` (1):** `resolve_outgoing_delivery_scope`; `outgoing_delivery_queue R(id, kind, payload_json, organization_id)`, `user_reminder_occurrences R(id, rule_id, organization_id)`, `reminder_rules R(integrator_rule_id, organization_id)`, `broadcast_audit R(id, organization_id)`, `operator_incidents R(id)`. Worker сначала узнаёт scope, поэтому tenant predicate ещё невозможен. [Q3][Q4]
- **16 patient program resolver — `app_seam_patient_program_resolver_owner` (1):** `resolve_current_patient_treatment_program_organization`; `treatment_program_instances R(id, organization_id, patient_user_id)`, `org_enrollments R(organization_id, platform_user_id, status)`, `be_organizations R(id, is_active)`. Здесь cross-tenant не нужен: signed patient id сужает policy. [Q3][Q4]

### 17–19. Настройки

- **17 preauth — `app_seam_settings_preauth_owner` (5):** `get_web_push_vapid_public_key`, `is_max_bot_configured`, `is_sms_provider_configured`, `is_telegram_login_configured`, `read_webapp_preauth_provider_setting`; `system_settings R(key, scope, organization_id, value_json)`, `app_runtime_settings R(key, scope, organization_id, audience, value_json)`. Policy ограничивается точным allowlist ключей; caller нельзя дать всю конфигурацию/секреты. [Q3][Q4]
- **18 integrator — `app_seam_settings_integrator_owner` (5):** `read_integrator_auth_channel_setting`, `read_integrator_platform_integration_availability`, `read_integrator_provider_runtime_setting`, `read_integrator_smtp_outbound_setting`, `read_outgoing_delivery_reclaim_config`; `system_settings R(key, scope, organization_id, value_json)`. Policy — allowlist ключей integrator. [Q3][Q4]
- **19 runtime — `app_seam_settings_runtime_owner` (5):** `read_current_patient_ui_setting`, `read_global_server_runtime_setting`, `read_media_worker_runtime_setting`, `read_public_runtime_setting`, `read_webapp_server_runtime_setting`; `app_runtime_settings R(key, scope, organization_id, audience, value_json)`, `system_settings R(key, scope, organization_id, value_json)`, `org_enrollments R(organization_id, platform_user_id, status)`. Global/server и patient UI не должны открывать caller-у соседние settings. [Q3][Q4]

### 20. SaaS/org commerce — `app_seam_org_commerce_owner` (8)

Функции: `apply_paid_saas_billing_tariff`, `prepare_organization_lifecycle_notification_context`, `read_current_org_tariff_transition_usage`, `read_org_enforced_quota_usage`, `resolve_organization_cabinet_access`, `resolve_organization_mechanic_access`, `saas_billing_effective_tariff`, `saas_billing_effective_tariff_for_current_org`.

Поверхность: `be_organizations RU(id, is_active, tariff_id, cabinet_first_entered_at, created_at, updated_at)`; `be_branches R(organization_id, is_active)`; `be_organization_members R(organization_id, specialist_id, status)`; `org_enrollments R(organization_id, status)`; `organization_member_invites R(organization_id, invited_role, status, expires_at, accepted_membership_id)`; `patient_files R(organization_id, size_bytes)`; `saas_billing_invoices R(id, organization_id, tariff_id, status)`; `saas_billing_subscriptions R(organization_id, tariff_id, status, current_period_starts_at, current_period_ends_at, grace_ends_at, read_only_ends_at, tariff_snapshot)`; `saas_org_entitlement_overrides R(organization_id, mechanic, enabled, expires_at)`; `saas_organization_trials RU(organization_id, tariff_id, started_at, ends_at, status, post_trial_behavior, post_trial_tariff_id, discount_ends_at)`; `saas_paid_period_policy R(key, post_paid_period_behavior, post_paid_period_tariff_id, is_active)`; `saas_tariffs R(*)`; `admin_audit_log R(action, target_id, details, status, organization_id, created_at)`. Для `saas_tariffs` функция возвращает rowtype, поэтому текущий body реально требует все текущие колонки; это единственный `*` в этом representative-пути. Caller нельзя дать коммерческие UPDATE/кросс-org entitlement reads. [Q3][Q4]

### 21–23. Пациентские проекции и действия

- **21 org projection — `app_seam_patient_org_projection_owner` (2):** `read_current_patient_active_organizations`, `read_current_patient_organization_entitlements`; `org_enrollments R(organization_id, platform_user_id, status, created_at)`, `be_organizations R(id, title, is_active, tariff_id)`, `saas_billing_subscriptions R(organization_id, tariff_id, status, current_period_ends_at)`, `saas_org_entitlement_overrides R(organization_id, mechanic, enabled, seat_limit_override, quota, expires_at)`, `saas_organization_trials R(organization_id, tariff_id, ends_at, status, post_trial_behavior, post_trial_tariff_id)`, `saas_paid_period_policy R(key, post_paid_period_behavior, post_paid_period_tariff_id, is_active)`. Policy связывает всё с current patient enrollment. [Q3][Q4]
- **22 booking — `app_seam_patient_booking_owner` (2):** `read_current_patient_appointment_history`, `read_current_patient_booking_rows`; `be_appointments R(id, organization_id, platform_user_id, branch_id, room_id, specialist_id, service_id, start_at, end_at, status, deleted_at)`, `be_branches R(id, organization_id, title)`, `be_clinic_services R(id, organization_id, title)`, `be_rooms R(id, organization_id, title)`, `be_specialists R(id, organization_id, full_name)`, `be_specialist_service_availability R(id, organization_id, specialist_id, service_id, branch_id, city_code, is_active)`, `org_enrollments R(organization_id, platform_user_id, status)`, `patient_bookings R(*)` — второй body возвращает legacy row shape; минимизация его полного списка **не доказана** до Ф7. [Q3][Q4]
- **23 self actions — `app_seam_patient_self_actions_owner` (3):** `set_current_patient_calendar_timezone`, `touch_current_patient_plan_last_opened`, `touch_current_patient_support_conversation_activity`; `org_enrollments R(organization_id, platform_user_id, status)`, `platform_users U(id, calendar_timezone, updated_at)`, `treatment_program_instances U(id, organization_id, patient_user_id, status, patient_plan_last_opened_at, updated_at)`, `support_conversation_messages R(id, conversation_id, sender_role, organization_id)`, `support_conversations U(id, organization_id, platform_user_id, status, last_message_at, updated_at)`. Policy строго current org+patient. [Q3][Q4]

### 24–28. Reminders

- **24 patient actions — `app_seam_reminder_patient_owner` (8):** `patient_cancel_pending_reminder_occurrences`, `patient_disable_reminder_messenger_topic`, `patient_done_reminder_occurrence`, `patient_reminder_notification_settings`, `patient_set_reminder_mute`, `patient_set_reminder_muted_until`, `patient_skip_reminder_occurrence`, `patient_snooze_reminder_occurrence`. Таблицы/колонки: `user_reminder_occurrences RUD(id, rule_id, organization_id, platform_user_id, status, planned_at, queued_at, sent_at, failed_at, delivery_channel, delivery_job_id, error_code, delivery_generation, updated_at)`; `reminder_rules R(integrator_rule_id, organization_id, platform_user_id, category, notification_topic_code)`; `org_enrollments R(organization_id, platform_user_id, status)`; `platform_users RU(id, integrator_user_id, email, email_verified_at, reminder_muted_until, updated_at)`; `reminder_journal RI(rule_id, occurrence_id, action, snooze_until, skip_reason, organization_id)`; `reminder_occurrence_history RIU(integrator_occurrence_id, integrator_rule_id, organization_id, platform_user_id, status, delivery_channel, snoozed_at, snoozed_until, skipped_at, skip_reason)`; channel/topic/subscription tables только `user/channel/topic/is_enabled/bot_blocked` поля; `app_runtime_settings R(key, scope, organization_id, value_json)`. Policy строго current org+patient. [Q3][Q4]
- **25 materialization — `app_seam_reminder_materialization_owner` (5):** `list_scheduler_reminder_organization_ids`, `mark_patient_reminder_occurrence_queued`, `patient_reminder_materialization_fingerprint`, `revalidate_patient_reminder_delivery_materialization`, `upsert_patient_reminder_occurrence_plan`. Поверхность: `user_reminder_occurrences RIU`, `outgoing_delivery_queue RU`, `reminder_rules R`, `platform_users R`, `reminder_journal R`, `system_settings R`, channel/topic/subscription tables R. Точные named columns — Q4; cross-org scheduler по определению требует policy `true` на этих конкретных таблицах. [Q3][Q4]
- **26 specialist — `app_seam_reminder_specialist_owner` (4):** `apply_specialist_task_reminder_success_outcome`, `refresh_specialist_task_reminder_materialization`, `revalidate_specialist_task_reminder_materialization`, `specialist_task_reminder_materialization_fingerprint`. Поверхность: `outgoing_delivery_queue RU(id, kind, payload_json, status, next_retry_at, sent_at, last_error, updated_at, organization_id)`; `specialist_tasks RU(id, organization_id, owner_user_id, patient_user_id, title, description, due_at, remind_at, is_important, completed_at, reminder_sent_at, updated_at)`; `platform_users/system_settings/channel/topic/subscription` R. Для UPDATE `specialist_tasks` уже существует узкая queue-id policy; её надо переименовать на нового owner, не заменять `true`. [Q7]
- **27 appointment — `app_seam_reminder_appointment_owner` (2):** `advance_appointment_reminder_messenger_ladder`, `revalidate_appointment_reminder_materialization`; `outgoing_delivery_queue RU(id, kind, channel, payload_json, status, attempt_count, next_retry_at, dead_at, last_error, updated_at, organization_id)`; `be_appointments R(id, organization_id, platform_user_id, start_at, status, deleted_at)`; identity/channel/topic/subscription tables R. Worker cross-org; policy сужается transaction-local queue id, а не tenant context. [Q3][Q4]
- **28 email cooldown — `app_seam_reminder_email_cooldown_owner` (2):** `read_reminder_transactional_email_cooldown`, `record_reminder_transactional_email_cooldown`; `email_send_cooldowns RI(user_id, email_normalized, last_sent_at)`. Cross-user operational lookup честно требует `true` на одной таблице и трёх колонках. [Q3][Q4]

### 29–31. Телеметрия

- **29 patient — `app_seam_telemetry_patient_owner` (2):** `record_current_patient_analytics_event`, `record_current_patient_push_open`; `org_enrollments R(organization_id, platform_user_id, status)`, `product_analytics_events_recent I(organization_id, occurred_at, event_type, entry_channel, page_key, user_id, client_session_id, push_tracking_id, topic_code, push_kind, warmup_slogan_key, metadata)`, `product_analytics_hourly I(organization_id, bucket_hour, event_type, entry_channel, page_key, topic_code, push_kind, warmup_slogan_key, event_count, updated_at)`, `product_analytics_user_hourly I(organization_id, bucket_hour, user_id, entry_channel, page_key, app_opens, page_views, push_opens, active_minutes, last_seen_at, updated_at)`, `product_push_notifications R(id, organization_id, user_id, topic_code, push_kind, warmup_slogan_key)`. Policy current org+patient. [Q3][Q4]
- **30 media — `app_seam_telemetry_media_owner` (2):** `increment_media_playback_resolution_stat`, `record_media_playback_resolution_event`; `media_files R(id, organization_id)`, `media_playback_resolution_events I(organization_id, user_id, media_id, delivery, fallback_used)`, `media_playback_stats_hourly I(bucket_hour, delivery, resolved_count, fallback_count)`. Events narrow to current org+patient; hourly aggregate is global technical table and can use `true` only for this owner. [Q3][Q4]
- **31 operator — `app_seam_telemetry_operator_owner` (5):** `mark_operator_incident_alert_sent`, `open_or_touch_operator_incident`, `operator_incident_alert_already_sent`, `record_global_email_delivery_attempt`, `record_operator_delivery_attempt`; `operator_incidents RIU(id, dedup_key, direction, integration, error_class, error_detail, last_seen_at, occurrence_count, resolved_at, alert_sent_at)`, `integrator.delivery_attempt_logs I(intent_type, intent_event_id, correlation_id, channel, status, attempt, reason, payload_json, occurred_at)`, `outgoing_delivery_queue R(kind, channel, payload_json, status)`. Это глобальная операционная телеметрия; честный policy `true` на трёх поимённых таблицах. [Q3][Q4]

### 32–35. Каталоги, directory, exclusions

- **32 public booking cities — `app_seam_catalog_public_owner` (1):** `list_active_booking_cities`; `booking_cities R(id, code, title, is_active, sort_order)`. Только активный публичный справочник. [Q3][Q4]
- **33 clinical measure kinds — `app_seam_catalog_admin_owner` (3):** `list_clinical_test_measure_kinds`, `save_clinical_test_measure_kinds`, `upsert_clinical_test_measure_kind_by_label`; `clinical_test_measure_kinds RIU(id, code, label, sort_order)`. Caller не получает произвольный bulk-DML, функция нормализует список/upsert. [Q3][Q4]
- **34 platform org directory — `app_seam_org_directory_owner` (1):** `list_platform_organization_members`; `be_organization_members R(id, organization_id, platform_user_id, role, specialist_id, status, doctor_screens_disabled, created_at, updated_at)`, `platform_users R(id, display_name)`. Это platform-only cross-org lookup; policy `true` честна только при закрытом EXECUTE (сейчас EXECUTE только `app_owner`). [Q5]
- **35 telemetry exclusion — `app_seam_telemetry_exclusion_owner` (2):** `is_current_patient_test_account`, `is_platform_registration_analytics_user_excluded`; `org_enrollments R(organization_id, platform_user_id, status)`, `platform_users R(id, phone_normalized, role)`, `user_channel_bindings R(user_id, channel_code, external_id)`, `system_settings R(key, scope, organization_id, value_json)` только `test_account_identifiers`. Caller нельзя дать полный identifier allowlist. [Q3][Q4]

## Representative SQL: точный ACL и policy для каждого шва

Общий role shape для каждой строки:

```sql
CREATE ROLE <owner> NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA app, public TO <owner>; -- integrator добавляется только швам 15/24/25/31
-- У роли нет членов; это проверяется по pg_auth_members, отдельного GRANT role membership нет.
```

Ниже `CREATE POLICY` предполагает, что Ф5 уже сделал `ENABLE/FORCE ROW LEVEL SECURITY`. Имена функций приведены как representative; это SQL-эскиз будущей миграции/генератора, сейчас не выполнялся. Для краткости показана одна несущая policy каждого шва; остальные таблицы получают тот же тип предиката из census, а **не** неявный обход. [Q6]

```sql
-- 01 reset_principal_context()
GRANT SELECT (backend_pid), DELETE ON app.principal_context TO app_seam_context_owner;
CREATE POLICY seam_context_delete ON app.principal_context FOR DELETE TO app_seam_context_owner
  USING (backend_pid = pg_backend_pid());

-- 02 email_password_delete_unverified_registration(uuid): genuine pre-session cleanup
GRANT SELECT (id, role, merged_into_id, email_verified_at), DELETE ON public.platform_users TO app_seam_password_auth_owner;
CREATE POLICY seam_password_delete_unverified ON public.platform_users FOR DELETE TO app_seam_password_auth_owner
  USING (role IN ('client','doctor') AND merged_into_id IS NULL AND email_verified_at IS NULL);

-- 03 email_otp_public_delete_unverified_registration(uuid)
GRANT SELECT (id, role, merged_into_id, email_verified_at), DELETE ON public.platform_users TO app_seam_email_otp_owner;
CREATE POLICY seam_email_otp_delete_unverified ON public.platform_users FOR DELETE TO app_seam_email_otp_owner
  USING (role = 'client' AND merged_into_id IS NULL AND email_verified_at IS NULL);

-- 04 passkey_list_current_exclusions()
GRANT SELECT (credential_id, transports, user_id) ON public.user_passkey_credentials TO app_seam_passkey_owner;
CREATE POLICY seam_passkey_self_read ON public.user_passkey_credentials FOR SELECT TO app_seam_passkey_owner
  USING (user_id = app.current_patient_user_id());

-- 05 close_active_user_phone_history(uuid): минимум поддерживает patient-self; staff-path не доказан
GRANT SELECT (platform_user_id, valid_to), UPDATE (valid_to) ON public.user_phone_history TO app_seam_phone_binding_owner;
CREATE POLICY seam_phone_history_self_update ON public.user_phone_history FOR UPDATE TO app_seam_phone_binding_owner
  USING (platform_user_id = app.current_patient_user_id() AND valid_to IS NULL)
  WITH CHECK (platform_user_id = app.current_patient_user_id());

-- 06 propagate_staff_session_version_to_session_epoch(): cross-user trigger
GRANT SELECT (id, session_epoch), UPDATE (session_epoch, updated_at) ON public.platform_users TO app_seam_self_security_owner;
CREATE POLICY seam_session_epoch_trigger_update ON public.platform_users FOR UPDATE TO app_seam_self_security_owner
  USING (true) WITH CHECK (true);

-- 07 get_preferred_auth_channel_code(uuid): genuine pre-session lookup
GRANT SELECT (platform_user_id, user_id, channel_code, is_preferred_for_auth) ON public.user_channel_preferences TO app_seam_identity_lookup_owner;
CREATE POLICY seam_identity_preferred_channel ON public.user_channel_preferences FOR SELECT TO app_seam_identity_lookup_owner
  USING (is_preferred_for_auth = true);

-- 08 cancel_patient_invite_email_proof(text,text)
GRANT SELECT (continuation_hash, status, proof_code_hash, proof_verified_at),
  UPDATE (proof_email_normalized, proof_code_hash, proof_started_at, proof_expires_at, proof_attempts, proof_verified_at, updated_at)
  ON public.patient_invites TO app_seam_patient_invite_owner;
CREATE POLICY seam_patient_invite_proof_cancel ON public.patient_invites FOR UPDATE TO app_seam_patient_invite_owner
  USING (status = 'pending' AND proof_verified_at IS NULL) WITH CHECK (status = 'pending');

-- 09 lookup_pending_org_invite(text): genuine token lookup
GRANT SELECT (id, organization_id, invited_email, invited_role, status, expires_at,
  created_by_platform_user_id, accepted_by_platform_user_id, accepted_membership_id, created_at, accepted_at, token_hash)
  ON public.organization_member_invites TO app_seam_org_invite_owner;
GRANT SELECT (id, title) ON public.be_organizations TO app_seam_org_invite_owner;
CREATE POLICY seam_org_invite_token_read ON public.organization_member_invites FOR SELECT TO app_seam_org_invite_owner
  USING (true);

-- 10 seed_reference_catalog_snapshot(uuid): provisioning is cross-org by input
GRANT SELECT (version, definition_json) ON public.reference_catalog_baselines TO app_seam_specialist_provision_owner;
GRANT SELECT (organization_id, baseline_version), INSERT (organization_id, baseline_version) ON public.reference_catalog_snapshot_receipts TO app_seam_specialist_provision_owner;
GRANT SELECT (id, organization_id, code), INSERT (organization_id, code, title, is_user_extensible) ON public.reference_categories TO app_seam_specialist_provision_owner;
GRANT INSERT (organization_id, category_id, code, title, sort_order, is_active, meta_json) ON public.reference_items TO app_seam_specialist_provision_owner;
CREATE POLICY seam_specialist_reference_seed ON public.reference_categories FOR ALL TO app_seam_specialist_provision_owner
  USING (NOT EXISTS (SELECT 1 FROM public.reference_catalog_snapshot_receipts r WHERE r.organization_id = reference_categories.organization_id))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM public.reference_catalog_snapshot_receipts r WHERE r.organization_id = reference_categories.organization_id));

-- 11 resolve_public_organization_slug(text): honest cross-tenant public lookup
GRANT SELECT (slug, kind, organization_id) ON public.organization_slug_claims TO app_seam_public_slug_owner;
GRANT SELECT (organization_id, is_published) ON public.clinic_public_directory_entries TO app_seam_public_slug_owner;
GRANT SELECT (id, is_active) ON public.be_organizations TO app_seam_public_slug_owner;
CREATE POLICY seam_public_slug_claim ON public.organization_slug_claims FOR SELECT TO app_seam_public_slug_owner USING (kind IN ('current','alias'));

-- 12 resolve_public_booking_organization(uuid,uuid,uuid): honest cross-tenant public lookup
GRANT SELECT (id, organization_id, is_active) ON public.be_branches TO app_seam_public_booking_owner;
GRANT SELECT (id, organization_id, is_active, public_widget_visible, admin_manual_only) ON public.be_clinic_services TO app_seam_public_booking_owner;
GRANT SELECT (id, organization_id, branch_id, service_id, is_active) ON public.be_specialist_service_availability TO app_seam_public_booking_owner;
GRANT SELECT (organization_id, entity_type, canonical_id, metadata) ON public.be_external_entity_mappings TO app_seam_public_booking_owner;
CREATE POLICY seam_public_booking_branch ON public.be_branches FOR SELECT TO app_seam_public_booking_owner USING (is_active = true);

-- 13 resolve_clinic_dedicated_bot_organization(text,text)
GRANT SELECT (channel, credential_fingerprint, organization_id, is_active) ON public.clinic_dedicated_bot_bindings TO app_seam_dedicated_bot_owner;
CREATE POLICY seam_dedicated_bot_resolve ON public.clinic_dedicated_bot_bindings FOR SELECT TO app_seam_dedicated_bot_owner USING (is_active = true);

-- 14 read_saas_billing_payment_provider()
GRANT SELECT (key, scope, organization_id, value_json) ON public.system_settings TO app_seam_payment_webhook_owner;
CREATE POLICY seam_payment_provider_setting ON public.system_settings FOR SELECT TO app_seam_payment_webhook_owner
  USING (key = 'saas_billing_payment_provider' AND scope = 'admin' AND organization_id IS NULL);

-- 15 resolve_outgoing_delivery_scope(uuid): honest cross-tenant scope discovery
GRANT SELECT (id, kind, organization_id, payload_json) ON public.outgoing_delivery_queue TO app_seam_delivery_scope_owner;
GRANT SELECT (id, rule_id, organization_id) ON integrator.user_reminder_occurrences TO app_seam_delivery_scope_owner;
GRANT SELECT (integrator_rule_id, organization_id) ON public.reminder_rules TO app_seam_delivery_scope_owner;
GRANT SELECT (id, organization_id) ON public.broadcast_audit TO app_seam_delivery_scope_owner;
GRANT SELECT (id) ON public.operator_incidents TO app_seam_delivery_scope_owner;
CREATE POLICY seam_delivery_scope_queue ON public.outgoing_delivery_queue FOR SELECT TO app_seam_delivery_scope_owner USING (true);

-- 16 resolve_current_patient_treatment_program_organization(uuid)
GRANT SELECT (id, organization_id, patient_user_id) ON public.treatment_program_instances TO app_seam_patient_program_resolver_owner;
GRANT SELECT (organization_id, platform_user_id, status) ON public.org_enrollments TO app_seam_patient_program_resolver_owner;
GRANT SELECT (id, is_active) ON public.be_organizations TO app_seam_patient_program_resolver_owner;
CREATE POLICY seam_patient_program_self ON public.treatment_program_instances FOR SELECT TO app_seam_patient_program_resolver_owner
  USING (patient_user_id = app.current_patient_user_id());

-- 17 get_web_push_vapid_public_key()
GRANT SELECT (key, scope, organization_id, value_json) ON public.system_settings TO app_seam_settings_preauth_owner;
CREATE POLICY seam_preauth_vapid ON public.system_settings FOR SELECT TO app_seam_settings_preauth_owner
  USING (key = 'web_push_vapid' AND scope = 'admin' AND organization_id IS NULL);

-- 18 read_integrator_smtp_outbound_setting()
GRANT SELECT (key, scope, organization_id, value_json) ON public.system_settings TO app_seam_settings_integrator_owner;
CREATE POLICY seam_integrator_smtp ON public.system_settings FOR SELECT TO app_seam_settings_integrator_owner
  USING (key = 'smtp_outbound' AND scope = 'admin' AND organization_id IS NULL);

-- 19 read_global_server_runtime_setting(text)
GRANT SELECT (key, scope, audience, organization_id, value_json) ON public.app_runtime_settings TO app_seam_settings_runtime_owner;
CREATE POLICY seam_runtime_global_server ON public.app_runtime_settings FOR SELECT TO app_seam_settings_runtime_owner
  USING (key IN ('app_base_url','error_tracking_enabled','error_tracking_dsn') AND scope='admin'
    AND audience IN ('server','public') AND organization_id IS NULL);

-- 20 saas_billing_effective_tariff(uuid,uuid)
GRANT SELECT (organization_id, tariff_id, status, tariff_snapshot, current_period_starts_at, current_period_ends_at)
  ON public.saas_billing_subscriptions TO app_seam_org_commerce_owner;
GRANT SELECT ON public.saas_tariffs TO app_seam_org_commerce_owner; -- body returns full composite row
CREATE POLICY seam_org_commerce_subscription ON public.saas_billing_subscriptions FOR SELECT TO app_seam_org_commerce_owner
  USING (organization_id = app.current_org_id());

-- 21 read_current_patient_active_organizations()
GRANT SELECT (organization_id, platform_user_id, status, created_at) ON public.org_enrollments TO app_seam_patient_org_projection_owner;
GRANT SELECT (id, title, is_active) ON public.be_organizations TO app_seam_patient_org_projection_owner;
CREATE POLICY seam_patient_org_enrollment ON public.org_enrollments FOR SELECT TO app_seam_patient_org_projection_owner
  USING (platform_user_id = app.current_patient_user_id() AND status='active');

-- 22 read_current_patient_appointment_history()
GRANT SELECT (id, organization_id, platform_user_id, branch_id, room_id, specialist_id, service_id, start_at, end_at, status, deleted_at) ON public.be_appointments TO app_seam_patient_booking_owner;
GRANT SELECT (id, organization_id, full_name) ON public.be_specialists TO app_seam_patient_booking_owner;
GRANT SELECT (id, organization_id, title) ON public.be_branches, public.be_rooms, public.be_clinic_services TO app_seam_patient_booking_owner;
GRANT SELECT (organization_id, platform_user_id, status) ON public.org_enrollments TO app_seam_patient_booking_owner;
CREATE POLICY seam_patient_booking_appointment ON public.be_appointments FOR SELECT TO app_seam_patient_booking_owner
  USING (organization_id=app.current_org_id() AND platform_user_id=app.current_patient_user_id() AND deleted_at IS NULL);

-- 23 touch_current_patient_plan_last_opened(uuid)
GRANT SELECT (organization_id, platform_user_id, status) ON public.org_enrollments TO app_seam_patient_self_actions_owner;
GRANT SELECT (id, organization_id, patient_user_id, status), UPDATE (patient_plan_last_opened_at, updated_at)
  ON public.treatment_program_instances TO app_seam_patient_self_actions_owner;
CREATE POLICY seam_patient_touch_plan ON public.treatment_program_instances FOR UPDATE TO app_seam_patient_self_actions_owner
  USING (organization_id=app.current_org_id() AND patient_user_id=app.current_patient_user_id() AND status='active')
  WITH CHECK (organization_id=app.current_org_id() AND patient_user_id=app.current_patient_user_id());

-- 24 patient_cancel_pending_reminder_occurrences(text)
GRANT SELECT (id, rule_id, organization_id, platform_user_id, status), DELETE ON integrator.user_reminder_occurrences TO app_seam_reminder_patient_owner;
GRANT SELECT (integrator_rule_id, organization_id, platform_user_id) ON public.reminder_rules TO app_seam_reminder_patient_owner;
CREATE POLICY seam_patient_reminder_occurrence ON integrator.user_reminder_occurrences FOR DELETE TO app_seam_reminder_patient_owner
  USING (organization_id=app.current_org_id() AND platform_user_id=app.current_patient_user_id() AND status IN ('planned','queued'));

-- 25 list_scheduler_reminder_organization_ids(): genuine cross-org scheduler
GRANT SELECT (is_enabled, platform_user_id, organization_id, integrator_rule_id) ON public.reminder_rules TO app_seam_reminder_materialization_owner;
GRANT SELECT (rule_id, organization_id, status) ON integrator.user_reminder_occurrences TO app_seam_reminder_materialization_owner;
CREATE POLICY seam_scheduler_rules_scan ON public.reminder_rules FOR SELECT TO app_seam_reminder_materialization_owner USING (true);

-- 26 revalidate_specialist_task_reminder_materialization(uuid)
GRANT SELECT (id, kind, status, payload_json), UPDATE (status, next_retry_at, last_error, updated_at)
  ON public.outgoing_delivery_queue TO app_seam_reminder_specialist_owner;
CREATE POLICY seam_specialist_materialization_queue ON public.outgoing_delivery_queue FOR UPDATE TO app_seam_reminder_specialist_owner
  USING (id=NULLIF(current_setting('app.specialist_materialization_queue_id',true),'')::uuid AND kind='specialist_task_reminder')
  WITH CHECK (id=NULLIF(current_setting('app.specialist_materialization_queue_id',true),'')::uuid);

-- 27 advance_appointment_reminder_messenger_ladder(uuid,integer,text)
GRANT SELECT (id, kind, status, attempt_count, channel, payload_json),
  UPDATE (status, dead_at, last_error, updated_at, channel, payload_json, next_retry_at)
  ON public.outgoing_delivery_queue TO app_seam_reminder_appointment_owner;
CREATE POLICY seam_appointment_queue ON public.outgoing_delivery_queue FOR UPDATE TO app_seam_reminder_appointment_owner
  USING (id=NULLIF(current_setting('app.appointment_reminder_queue_id',true),'')::uuid AND kind='appointment_reminder')
  WITH CHECK (id=NULLIF(current_setting('app.appointment_reminder_queue_id',true),'')::uuid);

-- 28 read_reminder_transactional_email_cooldown(uuid)
GRANT SELECT (user_id, email_normalized, last_sent_at) ON public.email_send_cooldowns TO app_seam_reminder_email_cooldown_owner;
CREATE POLICY seam_reminder_email_cooldown ON public.email_send_cooldowns FOR SELECT TO app_seam_reminder_email_cooldown_owner
  USING (email_normalized='!reminder_txn_v1');

-- 29 record_current_patient_analytics_event(timestamptz,text,text,text,text,jsonb)
GRANT SELECT (organization_id, platform_user_id, status) ON public.org_enrollments TO app_seam_telemetry_patient_owner;
GRANT INSERT (organization_id, occurred_at, event_type, entry_channel, page_key, user_id, client_session_id, metadata) ON public.product_analytics_events_recent TO app_seam_telemetry_patient_owner;
GRANT INSERT (organization_id, bucket_hour, event_type, entry_channel, page_key, topic_code, push_kind, warmup_slogan_key, event_count, updated_at), UPDATE (event_count,updated_at) ON public.product_analytics_hourly TO app_seam_telemetry_patient_owner;
GRANT INSERT (organization_id,bucket_hour,user_id,entry_channel,page_key,app_opens,page_views,push_opens,active_minutes,last_seen_at,updated_at), UPDATE (app_opens,page_views,push_opens,active_minutes,last_seen_at,updated_at) ON public.product_analytics_user_hourly TO app_seam_telemetry_patient_owner;
CREATE POLICY seam_patient_analytics_insert ON public.product_analytics_events_recent FOR INSERT TO app_seam_telemetry_patient_owner
  WITH CHECK (organization_id=app.current_org_id() AND user_id=app.current_patient_user_id());

-- 30 record_media_playback_resolution_event(uuid,uuid,text,boolean)
GRANT SELECT (id, organization_id) ON public.media_files TO app_seam_telemetry_media_owner;
GRANT INSERT (organization_id,user_id,media_id,delivery,fallback_used) ON public.media_playback_resolution_events TO app_seam_telemetry_media_owner;
CREATE POLICY seam_media_resolution_insert ON public.media_playback_resolution_events FOR INSERT TO app_seam_telemetry_media_owner
  WITH CHECK (organization_id=app.current_org_id() AND user_id=app.current_patient_user_id());

-- 31 operator_incident_alert_already_sent(uuid): global operational table
GRANT SELECT (id, alert_sent_at) ON public.operator_incidents TO app_seam_telemetry_operator_owner;
CREATE POLICY seam_operator_incident_read ON public.operator_incidents FOR SELECT TO app_seam_telemetry_operator_owner USING (true);

-- 32 list_active_booking_cities()
GRANT SELECT (id,code,title,is_active,sort_order) ON public.booking_cities TO app_seam_catalog_public_owner;
CREATE POLICY seam_public_booking_city ON public.booking_cities FOR SELECT TO app_seam_catalog_public_owner USING (is_active=true);

-- 33 list_clinical_test_measure_kinds()
GRANT SELECT (id,code,label,sort_order) ON public.clinical_test_measure_kinds TO app_seam_catalog_admin_owner;
CREATE POLICY seam_clinical_measure_kind_read ON public.clinical_test_measure_kinds FOR SELECT TO app_seam_catalog_admin_owner USING (true);

-- 34 list_platform_organization_members(uuid): platform-only cross-org function
GRANT SELECT (id,organization_id,platform_user_id,role,specialist_id,status,doctor_screens_disabled,created_at,updated_at) ON public.be_organization_members TO app_seam_org_directory_owner;
GRANT SELECT (id,display_name) ON public.platform_users TO app_seam_org_directory_owner;
CREATE POLICY seam_platform_org_directory ON public.be_organization_members FOR SELECT TO app_seam_org_directory_owner USING (true);

-- 35 is_current_patient_test_account()
GRANT SELECT (organization_id,platform_user_id,status) ON public.org_enrollments TO app_seam_telemetry_exclusion_owner;
GRANT SELECT (id,phone_normalized) ON public.platform_users TO app_seam_telemetry_exclusion_owner;
GRANT SELECT (user_id,channel_code,external_id) ON public.user_channel_bindings TO app_seam_telemetry_exclusion_owner;
GRANT SELECT (key,scope,organization_id,value_json) ON public.system_settings TO app_seam_telemetry_exclusion_owner;
CREATE POLICY seam_test_account_setting ON public.system_settings FOR SELECT TO app_seam_telemetry_exclusion_owner
  USING (key='test_account_identifiers' AND scope='admin' AND organization_id IS NULL);
```

### Почему это удовлетворяет `FORCE RLS`

`FORCE ROW LEVEL SECURITY` делает владельца таблицы subject to policies; новый владелец **функции** вообще не владеет таблицей. Его путь состоит из двух независимых разрешений: column/table ACL пропускает тип операции, затем policy `TO exact_owner` пропускает строку. `NOBYPASSRLS` запрещает третий скрытый путь. Если policy отсутствует, owner получает 0 строк; при `row_security=off` проверочный прогон получает ошибку вместо тихого нуля. Сам механизм `FORCE + policy` и композиция policies уже исполнены на disposable PG16 в evidence/12; live DEV показывает 126 policies на таблицах, которые сегодня трогают эти 132 functions, и только одна restrictive policy во всей проверенной области, на неиспользуемой здесь `operator_job_status`. [Q6][Q7][R3]

Для genuine pre-session/cross-tenant таблиц (`slug`, public booking, webhook, delivery scope, scheduler, global telemetry/health) policy нельзя честно связать с ещё не существующим tenant context. Узость там обеспечивают три вещи одновременно: отдельный owner на один шов; только named columns; фиксированная function body/EXECUTE ACL. `USING(true)` на этих таблицах — не маскировка, а явная запись неизбежного cross-tenant чтения в каталоге. [Q2][Q3][Q5]

## Окно миграции

Текущий wrapper уже задаёт правильную форму временной элевации, но его постоянные предпосылки про `app_owner BYPASSRLS` устаревают. [R1][R2]

1. До окна migrator обязан быть `NOBYPASSRLS` и не состоять в owner-role; TEST останавливает пять writer units, DEV требует внешней координации единственного writer. [R1]
2. Только вокруг `pnpm migrate` superuser временно даёт migrator: (a) `BYPASSRLS` для backfill под FORCE; (b) membership в нужных object-owner ролях для owner-only DDL/`ALTER ... OWNER`. В новой схеме это не означает постоянный обход ни у одного seam owner. [R1][R2]
3. После `pnpm migrate` wrapper сначала выполняет `ALTER ROLE <migrator> NOBYPASSRLS`, затем `REVOKE <owner> FROM <migrator>`. `EXIT`/signal cleanup повторяет это и при ошибке. [R1][R2]
4. Post-state обязан проверить `rolbypassrls=false` и `pg_has_role(...,'member')=false` для **каждого** временного owner membership. Сейчас проверяется один `app_owner`; генератор должен заменить single-role assertion на список затронутых seam owners. [R1][R2]
5. Постоянная форма после окна: `postgres` — единственное допустимое исключение как superuser; `app_owner`, `saas_system_health_owner`, все 35 seam owners и все runtime/migrator roles — `NOBYPASSRLS`. [Q1]

## Что сломается и во что должно превратиться

Точный source-census выполнен R2 после index-search R0. Исторические применённые migrations не переписываются; их комментарии остаются историей, а новый closure нормализует итоговый каталог. [R0][R2]

| Место | Что сегодня предполагает | Во что заменить при реализации |
|---|---|---|
| `deploy/host/deploy-test-saas.sh:907,955,1031,1275,2801+` | `app_owner NOLOGIN+BYPASSRLS`, один whole-class grant gate | `app_owner NOBYPASSRLS`; 35 owner-shape checks; ownership/ACL/policy completeness по каждой seam declaration; никаких советов «ACL gap, потому что bypass» |
| `deploy/host/deploy-test.sh:173-174` | exact tuple заканчивается `rolbypassrls=true` | exact tuple для `app_owner` заканчивается `false`; затем seam-owner list gate |
| `deploy/host/migrate-dev.sh:67-76` | постоянный `app_owner` обязан быть BYPASS до временного membership | precondition `app_owner NOBYPASSRLS`; временный BYPASS только у `bcb_webapp_dev_user`; membership list cleanup |
| `scripts/deploy-saas-667.sh:163-167,409-411` | создаёт/переутверждает owner как BYPASS | owner(s) `NOBYPASSRLS`; оставить только temporary migrator BYPASS и его cleanup |
| `deploy/postgres/privileges/declaration.ts:455` + proof fixture/generated snapshot | объявляет `app_owner.bypassrls=true` и старый owner surface | 35 seam owner entries `bypassrls:false`, `app_owner:false`, explicit policies/column ACL/function ownership |
| `scripts/verify-a1-rls-conformance.mjs:266` и app-owner checks | scratch `app_owner BYPASSRLS` | scratch seam-owner `NOBYPASSRLS` + FORCE policies; fault injection удалённой policy должна краснить вызов |
| `deploy/postgres/saas-system-health-diagnostics.sql:167-172,280` | `saas_system_health_owner BYPASSRLS` | `NOBYPASSRLS`; named-column grants и `TO saas_system_health_owner USING(true)` на curated diagnostic tables |
| `deploy/postgres/{public-clinic-slug-bootstrap-resolver,public-booking-bootstrap-resolver,patient-invites-rls,organization-member-invites-rls,specialist-signup-public-bootstrap-rls,specialist-owner-provisioning-rls,runtime-overlay-app-owner-handoff}.sql` | preflight требует `app_owner.rolbypassrls=true`; ownership у одного role | preflight exact seam owner `NOBYPASSRLS`; transfer function to that owner; install per-table policy |
| `deploy/postgres/dev-c3-app-function-owners.sql` | карта многих функций → `app_owner`; комментарий «BYPASSRLS» | полная карта 132 → 35 owners; table grants become column grants; existing 7 `TO app_owner` policies переименовать по seam |
| `deploy/postgres/phase4-force-rls-cutover.sql`, `test-strict-rls-finalizer.sql`, `u5a-*` | часть gates считает owner bypass обязательным | superuser/migrator temporary exception отделить от permanent owners; permanent assert `NOT rolbypassrls` |
| `apps/webapp/scripts/postgres-integration/harness-lib.ts:569-571` | real clusters всегда имеют `app_owner BYPASSRLS` | fixture creates requested seam owners/policies; не один всемогущий owner |
| `deploy/host/migrate-dev.test.mjs:250-330` | пинит single `APP_OWNER_ROLE`, временный GRANT/REVOKE и source shape wrapper | сохранить тест temporary migrator BYPASS/cleanup, заменить single membership fixture на список seam/object owners и постоянный `app_owner NOBYPASSRLS` |
| disposable scripts `patient-invites-disposable-proof`, `smoke-c2-identity-invite`, `check-b1-payment-capture-replay`, `check-access-ladder-transitions`, `check-cms-pages-quota-race`; integrator D30 fixture | создают `app_owner BYPASSRLS` или кодируют старую форму | создавать только нужный seam owner `NOBYPASSRLS` и policy конкретного теста |
| `pgSaasBillingCapture.postgres.integration.test.ts`, `saasBillingTariffSnapshot.devDbProof.test.ts`, `run-saas-isolation-test-scenarios.ts`, `patient-organization-test-lifecycle.ts` | assertions/comments разрешают super-or-bypass или особый app_owner state | ожидать NOBYPASS; успешность доказывать policy+ACL, не атрибутом роли |
| применённые migrations 0205/0238/0240/0245/0248/0250/0252/0253/0254/0256/0258/0343/0348/0350/0353/0354/0356 | исторические bodies/comments говорят «app_owner bypasses RLS» | не переписывать; новая migration/closure переносит owners и ставит policies после replay |

Точный инвентарь активных файлов с положительной зависимостью от постоянного bypass, полученный R2: `deploy/host/deploy-test-saas.sh`, `deploy/host/deploy-test.sh`, `deploy/host/migrate-dev.sh`, `deploy/host/migrate-dev.test.mjs`, `scripts/deploy-saas-667.sh`, `scripts/verify-a1-rls-conformance.mjs`, `deploy/postgres/saas-system-health-diagnostics.sql`, `deploy/postgres/dev-c1-bootstrap-schema-app-grants.sql`, `deploy/postgres/dev-c3-app-function-owners.sql`, `deploy/postgres/organization-member-invites-rls.sql`, `deploy/postgres/patient-invites-rls.sql`, `deploy/postgres/patient-web-push-vapid-public-key-accessor.sql`, `deploy/postgres/public-booking-bootstrap-resolver.sql`, `deploy/postgres/public-clinic-slug-bootstrap-resolver.sql`, `deploy/postgres/specialist-owner-provisioning-rls.sql`, `deploy/postgres/specialist-signup-public-bootstrap-rls.sql`, `deploy/postgres/runtime-overlay-app-owner-handoff.sql`, `deploy/postgres/phase4-force-rls-cutover.sql`, `deploy/postgres/test-strict-rls-finalizer.sql`, `deploy/postgres/u5a-patient-organization-test-lifecycle.sql`, `deploy/postgres/privileges/declaration.ts`, `deploy/postgres/privileges/fixtures/proof-setup.sql`, `deploy/postgres/privileges/fixtures/generated/privileges.bcb_privproof.sql`, `apps/webapp/scripts/postgres-integration/harness-lib.ts`, `apps/webapp/scripts/patient-invites-disposable-proof.mjs`, `apps/webapp/scripts/smoke-c2-identity-invite.mjs`, `apps/webapp/scripts/check-b1-payment-capture-replay.mjs`, `apps/webapp/scripts/check-access-ladder-transitions.mjs`, `apps/webapp/scripts/check-cms-pages-quota-race.mjs`, `apps/integrator/src/infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts`, `apps/webapp/src/infra/repos/pgSaasBillingCapture.postgres.integration.test.ts`, `apps/webapp/src/infra/repos/saasBillingTariffSnapshot.devDbProof.test.ts`, `apps/webapp/scripts/run-saas-isolation-test-scenarios.ts`, `apps/webapp/scripts/patient-organization-test-lifecycle.ts`. [R2]

Отдельно неизменяемая история replay: migrations `0205`, `0238`, `0240`, `0245`, `0248`, `0250`, `0252`, `0253`, `0254`, `0256`, `0258`, `0343`, `0348`, `0350`, `0353`, `0354`, `0356`. Они не являются местом исправления, но после их применения closure обязан привести итоговый каталог к новой форме. [R2]

### Health без bypass

Live body `read_curated_system_health()` читает cross-org operational aggregates (`media_files`, `media_playback_client_events`, `notification_delivery_attempts`, `outgoing_delivery_queue` и pre-0196 helper); `read_curated_playback_health()` читает `media_hls_proxy_error_events` и pre-0196 helper. Это genuine global health, поэтому честный вариант — оставить **одного существующего** `saas_system_health_owner`, сделать его `NOBYPASSRLS`, дать только named diagnostic columns и policies `TO saas_system_health_owner USING (true)` на exact tables. Он не входит в 35 новых owners и не требует обхода. [Q8]

Пример:

```sql
ALTER ROLE saas_system_health_owner NOBYPASSRLS;
GRANT SELECT (created_at, reason_code) ON public.media_hls_proxy_error_events TO saas_system_health_owner;
CREATE POLICY seam_system_health_hls_errors ON public.media_hls_proxy_error_events
  FOR SELECT TO saas_system_health_owner USING (true);
```

## Честные ограничения

1. **Функций, которым технически нужен `BYPASSRLS`, нет.** Есть функции, которым нужен cross-tenant scan; exact-owner policy `true` — более узкий и каталожно видимый механизм. [Q2][Q3]
2. `close_active_user_phone_history()` разрешает staff/nonstaff callers, но current body может принять произвольный `p_user`, когда patient context NULL. Минимальный policy выше поддерживает только patient-self. Не доказано, нужен ли staff cross-user path; Ф7 должен получить красный отказ и решить поимённо. [Q5][Q8]
3. `propagate_staff_session_version_to_session_epoch()` — trigger и честно обновляет другого пользователя по `NEW.user_id`; для него policy `true` неизбежна на `platform_users`, но owner имеет только `UPDATE(session_epoch,updated_at)` и `SELECT(id,session_epoch)`. [Q8]
4. Швы 26/27 требуют transaction-local queue-id policy. Specialist body ставит `app.specialist_materialization_queue_id` только после первого чтения queue, а appointment body вообще не ставит `app.appointment_reminder_queue_id`; оба body должны выставить GUC до первого обращения. До этого policy будет under-grant и красный live-run. Ослаблять её до постоянного `true` в дизайне нельзя. [Q8]
5. Q4 — lexical column census, не SQL AST. Для больших bodies 10/20/22/24/25 точный function→column proof частично «не доказано»; declaration должна начинать с representative minima выше, а Ф7 добавлять только колонки, на которых реально получен 42501 и принято решение. [Q4]
6. Acceptance «нет контекста → 0 строк и запись в Postgres log» не достигается одной RLS policy: policy даёт тихий ноль. Этот документ предполагает решение Ф8: `current_org_id/current_patient_user_id/current_integrator_user_id` бросают 42501 при отсутствии/несовпадении подписанного context, а acceptance-run идёт с `row_security=off` для обнаружения скрытой фильтрации. [R3]

## ВОПРОСЫ ВЛАДЕЛЬЦУ

1. 25 функций имеют `EXECUTE TO PUBLIC`, включая mutation/telemetry functions. Решения, должен ли `PUBLIC` остаться grantee у каждой из них, в owner decisions/PLAN Ф3 нет. До решения перенос ownership не должен молча менять эти ACL. [Q5]
2. Нужен ли staff cross-user вызов `close_active_user_phone_history(p_user)`? Минимальная схема его намеренно блокирует; patient-self продолжает работать. [Q5][Q8]
3. `list_platform_organization_members()` сейчас executable только владельцем `app_owner`. Кто является будущим caller этого platform-only шва, не доказано; до ответа owner role получает table rights, но EXECUTE никому не выдаётся. [Q5]

## Команды доказательства

### Q0 — exact DEV gate (секрет не печатается)

```bash
set -a && source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev && set +a
db_target="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')"
[ "$db_target" = bcb_webapp_dev ]
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c \
  "SELECT current_database(),current_user,inet_server_addr(),inet_server_port();"
```

Результат: `bcb_webapp_dev | bcb_webapp_dev_user | 127.0.0.1 | 5432`. [Q0]

### Q1 — owners/count/attributes

```sql
BEGIN TRANSACTION READ ONLY;
SELECT r.rolname,r.rolsuper,r.rolbypassrls,count(*)
FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
GROUP BY r.rolname,r.rolsuper,r.rolbypassrls ORDER BY count(*) DESC,r.rolname;
ROLLBACK;
```

Результат: `app_owner 132 (bypass=t)`, `bcb_webapp_dev_user 88`, `saas_telemetry_owner 5`, `saas_system_health_owner 4 (bypass=t)`, ещё два владельца по одной функции. [Q1]

### Q2 — полный список 132 и bodies

```sql
BEGIN TRANSACTION READ ONLY;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
       l.lanname,p.provolatile,p.proconfig,length(pg_get_functiondef(p.oid)),
       pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
WHERE p.prosecdef AND r.rolname='app_owner'
  AND n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid);
ROLLBACK;
```

### Q3 — прямые relation references и R/I/U/D

```sql
BEGIN TRANSACTION READ ONLY;
WITH funcs AS (
  SELECT p.oid,p.proname,lower(pg_get_functiondef(p.oid)) def
  FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
  WHERE p.prosecdef AND r.rolname='app_owner'
), rels AS (
  SELECT c.oid,n.nspname,c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p')
)
SELECT f.proname,r.nspname,r.relname,
       f.def ~ ('\m(from|join|using)\s+'||r.nspname||'\.'||r.relname||'\M') AS r,
       f.def ~ ('\minsert\s+into\s+'||r.nspname||'\.'||r.relname||'\M') AS i,
       f.def ~ ('\mupdate\s+'||r.nspname||'\.'||r.relname||'\M') AS u,
       f.def ~ ('\mdelete\s+from\s+'||r.nspname||'\.'||r.relname||'\M') AS d
FROM funcs f JOIN rels r ON strpos(f.def,lower(r.nspname||'.'||r.relname))>0
ORDER BY f.proname,r.nspname,r.relname;
ROLLBACK;
```

Разбиение 35 seams выполнено `CASE proname` ровно по спискам в census; групповой результат дал 35 непустых групп и ни одного `UNMAPPED`. [Q3]

### Q4 — column tokens каждого body

```sql
BEGIN TRANSACTION READ ONLY;
WITH funcs AS (
  SELECT p.oid,p.proname,lower(pg_get_functiondef(p.oid)) def
  FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
  WHERE p.prosecdef AND r.rolname='app_owner'
), rels AS (
  SELECT c.oid,n.nspname,c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p')
)
SELECT f.proname,r.nspname,r.relname,a.attnum,a.attname
FROM funcs f JOIN rels r ON strpos(f.def,lower(r.nspname||'.'||r.relname))>0
JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
WHERE f.def ~ ('\m'||lower(a.attname)||'\M')
ORDER BY f.proname,r.nspname,r.relname,a.attnum;
ROLLBACK;
```

### Q5 — function EXECUTE grantees / PUBLIC count

```sql
BEGIN TRANSACTION READ ONLY;
WITH funcs AS (
 SELECT p.oid,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proacl,p.proowner
 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prosecdef AND r.rolname='app_owner'
)
SELECT f.nspname,f.proname,f.args,
       CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END grantee
FROM funcs f CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) x
WHERE x.privilege_type='EXECUTE' ORDER BY f.proname,grantee;
ROLLBACK;
```

Результат `count(DISTINCT oid) FILTER (WHERE grantee=0)`: 25. [Q5]

### Q6 — RLS/FORCE state всех упомянутых таблиц

```sql
BEGIN TRANSACTION READ ONLY;
WITH funcs AS (
 SELECT lower(pg_get_functiondef(p.oid)) def FROM pg_proc p
 JOIN pg_roles r ON r.oid=p.proowner WHERE p.prosecdef AND r.rolname='app_owner'
)
SELECT DISTINCT n.nspname,c.relname,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN funcs f ON strpos(f.def,lower(n.nspname||'.'||c.relname))>0
WHERE c.relkind IN ('r','p') ORDER BY n.nspname,c.relname;
ROLLBACK;
```

### Q7 — policies и старые policies `TO app_owner`

```sql
BEGIN TRANSACTION READ ONLY;
SELECT schemaname,tablename,policyname,permissive,cmd,roles,qual,with_check
FROM pg_policies
WHERE schemaname IN ('app','public','integrator')
ORDER BY schemaname,tablename,policyname;
ROLLBACK;
```

Результат: 126 policies на relation surface 132 функций; 7 policies явно `TO app_owner`; restrictive policy одна и относится к `operator_job_status`, не к census. [Q7]

### Q8 — representative bodies и health bodies

```sql
BEGIN TRANSACTION READ ONLY;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='app' AND p.proname IN (
  'reset_principal_context','email_password_delete_unverified_registration',
  'email_otp_public_delete_unverified_registration','passkey_list_current_exclusions',
  'close_active_user_phone_history','propagate_staff_session_version_to_session_epoch',
  'get_preferred_auth_channel_code','cancel_patient_invite_email_proof','lookup_pending_org_invite',
  'seed_reference_catalog_snapshot','resolve_public_organization_slug','resolve_public_booking_organization',
  'resolve_clinic_dedicated_bot_organization','read_saas_billing_payment_provider',
  'resolve_outgoing_delivery_scope','resolve_current_patient_treatment_program_organization',
  'get_web_push_vapid_public_key','read_integrator_smtp_outbound_setting','read_global_server_runtime_setting',
  'saas_billing_effective_tariff','read_current_patient_active_organizations',
  'read_current_patient_appointment_history','touch_current_patient_plan_last_opened',
  'patient_cancel_pending_reminder_occurrences','list_scheduler_reminder_organization_ids',
  'revalidate_specialist_task_reminder_materialization','advance_appointment_reminder_messenger_ladder',
  'read_reminder_transactional_email_cooldown','record_current_patient_analytics_event',
  'record_media_playback_resolution_event','operator_incident_alert_already_sent',
  'list_active_booking_cities','list_clinical_test_measure_kinds','list_platform_organization_members',
  'is_current_patient_test_account','read_curated_system_health','read_curated_playback_health'
)
ORDER BY p.proname;
ROLLBACK;
```

### Q9 — число предложенных seam owners

```bash
rg -o 'app_seam_[a-z_]+' \
  docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/25-definer-seams-without-bypassrls.md \
  | sort -u | wc -l
```

Результат: `35`. Это число проверяет, что в документе есть отдельное уникальное имя owner для каждого из 35 разделов census. [Q9]

### R0–R3 — repository evidence

```bash
node /home/dev/brain/tools/code-search.mjs "app_owner rolbypassrls deploy assert health check" --repo bcb -k 30
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' \
  '(app_owner|saas_system_health_owner|rolbypassrls|BYPASSRLS)' deploy scripts apps packages
sed -n '1,180p' deploy/host/migrate-dev.sh
sed -n '60,195p' deploy/host/deploy-test.sh
sed -n '130,205p' deploy/host/deploy-test-saas.sh
sed -n '264,361p' docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FACTS.md
sed -n '1025,1075p' docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/12-f0-mechanisms-proven-by-execution.md
```

`R0` — index search; `R1` — migration window bodies; `R2` — exact assumption census; `R3` — already executed PostgreSQL mechanism proof. Никакая команда из этого документа не меняла базу.
