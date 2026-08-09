# Ф3 — полный census `SECURITY DEFINER`: TEST + DEV

Дата снимка: 2026-08-09. Базы: `bersoncarebot_test` и `bcb_webapp_dev`. Все обращения к БД выполнены
только внутри `BEGIN TRANSACTION READ ONLY`; DDL/DML не выполнялись. Источник credentials —
`/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev`; имя TEST-базы подставлялось в тот же локальный URL,
после чего Q0 отдельно проверял `current_database()`. Никакие `*_prod`, `secondbrain` и `storylama_*` не открывались.

## Коротко для владельца

Полный набор — **244 уникальные definer-функции**: DEV содержит 231 из них, TEST — все 244; только DEV-функций
нет. Прежние 132 из evidence/25 входят сюда без потерь, вновь покрыты 112. Целевая раскладка — **42 шва**:
35 из evidence/25, два уже существовавших отдельных шва telemetry/health и пять действительно новых швов.
[Q1][Q2][Q6]

Владение login-мигратором — только дрейф, не архитектура. Все **38 TEST-функций** владельца
`bersoncarebot_test` имеют целевой шов ниже; ни одна не остаётся у login-роли. Единственная функция владельца
runtime-роли `app_platform_settings` — `app.start_provisioned_organization_trial()`: она читает глобальные правила
тарифа/триала, блокирует их строки, создаёт trial, меняет тариф организации и пишет audit. Её целевой владелец —
`app_seam_specialist_provision_owner`, потому что это атомарное продолжение первичного provisioning, а не право
runtime-роли на эти таблицы. [Q1][Q3][Q4]

**Ни одной из 244 функций `BYPASSRLS` не нужен.** Нужны честные cross-tenant policies на поимённых таблицах для
предсессионных lookup, scheduler/telemetry/health и других перечисленных ниже швов. Каждая такая policy принадлежит
одному `NOLOGIN NOBYPASSRLS` owner, ограничена названными колонками и фиксированным body. [Q3][Q4]

## 1. Что именно сверено

Q1 дал владельцев и количества:

| База | Всего | Владельцы |
|---|---:|---|
| `bcb_webapp_dev` | 231 | `app_owner` 132; `bcb_webapp_dev_user` 88; `saas_telemetry_owner` 5; `saas_system_health_owner` 4; `app_platform_settings` 1; `app_web_push_reminder_discovery_definer` 1 |
| `bersoncarebot_test` | 244 | `app_owner` 193; `bersoncarebot_test` 38; `saas_telemetry_owner` 7; `saas_system_health_owner` 4; `app_platform_settings` 1; `app_web_push_reminder_discovery_definer` 1 |

Q2 сравнил identity signature (`schema + proname + pg_get_function_identity_arguments`) и body hash:

- общих сигнатур — 231; только DEV — 0; только TEST — 13;
- у 88 общих функций отличается owner: 50 `bcb_webapp_dev_user → app_owner`, 38
  `bcb_webapp_dev_user → bersoncarebot_test`;
- у 10 общих функций отличается body; одна из них входит и в owner-drift, поэтому всего сигнатур с любым
  различием — 97.

### 1.1 Тринадцать функций только на TEST

Одиннадцать функций установлены штатными TEST overlay `integrator-server-runtime-config.sql` /
`c4-operational-runtime.sql`, имеют живых callers в integrator и отсутствуют на DEV. Это **deployment gap DEV**,
а не основание выбросить их из схемы: `list_google_calendar_probe_organization_ids`,
`open_or_touch_operator_probe_incident`, `read_integrator_clinic_delivery_credential`,
`read_integrator_google_calendar_setting`, `read_integrator_runtime_setting`, `read_operational_verbose_log_flag`,
`read_operator_health_probe_config`, `read_operator_outbound_probe_meta`,
`record_operational_delivery_attempt_audit`, `record_operator_outbound_probe_run`,
`resolve_operator_probe_incidents`. Для целевого дизайна gap важен: эти функции входят в швы 18 и 31, даже пока
DEV их не имеет. [R1]

Две оставшиеся — `read_saas_isolation_test_scenario_fixture_counts` и `set_saas_isolation_test_scenario` —
**намеренный TEST-only drift**: body сам отклоняет любую базу, кроме exact `bersoncarebot_test`, а installer
`test-saas-isolation-telemetry-fixtures.sql` выдаёт EXECUTE только telemetry operator. Они остаются в TEST-варианте
шва 36 и не должны появляться на DEV. [Q3][R1]

### 1.2 Десять различающихся bodies

Это deployment drift, а не новые сигнатуры. Целевой owner от него не меняется; live-run должен брать body из
принятой цепочки, а не объединять права двух версий «на всякий случай».

| Функция | Существенная разница TEST против DEV | Что важно для шва |
|---|---|---|
| `accept_org_invite` | TEST считает paid additional seats через effective tariff; DEV допускает overage по цене тарифа | шов 9; TEST дополнительно читает subscription/effective tariff, выдавать union до выбора target body нельзя |
| `email_auth_find_email_owner_conflict` | TEST читает `platform_users` напрямую; DEV вызывает confirmed-email resolver | шов 3; TEST нужна только identity-колонка, DEV — EXECUTE шва 7 |
| `email_password_find_login_candidate` | TEST сверяет primary normalized email; DEV использует confirmed-email resolver | шов 2; выдавать только поверхность принятого body |
| `list_scheduler_reminder_organization_ids` | TEST проверяет ownership occurrences и integrator rules; DEV сканирует patient rules | шов 25; TEST требует `integrator.user_reminder_occurrences` |
| `read_current_patient_booking_rows` | TEST требует canonical appointment и возвращает другой JSON shape | шов 22; точные `patient_bookings` columns остаются «не доказано» до выбора body/live-run |
| `read_current_patient_organization_entitlements` | TEST удалил post-paid policy branch | шов 21; `saas_paid_period_policy` DEV-only, не давать после принятия TEST body |
| `read_org_enforced_quota_usage` | только эквивалентный cast `integer`/`int` | шов 20; ACL не меняется |
| `read_webapp_server_runtime_setting` | TEST убрал key `auth_2fa_enabled` | шов 19; allowlist должен соответствовать принятому body |
| `record_operator_delivery_attempt` | TEST пишет широкую notification projection; DEV — узкий operator log | шов 31; это реальная смена relation/columns, не объединять поверхности |
| `start_provisioned_organization_trial` | TEST использует registration tariff и discount window, DEV — trial tariff/grace | шов 10; точные columns берутся из принятой версии |

## 2. Целевая раскладка: 244 функции → 42 шва

Швы 1–35, их исходные 132 функции и поверхности остаются как в evidence/25. Ниже показан итоговый размер каждого
шва; сумма 244 проверена Q6.

| # | Owner | Назначение | Всего функций |
|---:|---|---|---:|
| 1 | `app_seam_context_owner` | подписанный контекст | 6 |
| 2 | `app_seam_password_auth_owner` | парольный вход и общая auth-защита | 17 |
| 3 | `app_seam_email_otp_owner` | email OTP | 25 |
| 4 | `app_seam_passkey_owner` | passkey | 9 |
| 5 | `app_seam_phone_binding_owner` | привязка контакта/канала | 13 |
| 6 | `app_seam_self_security_owner` | PIN/session epoch | 8 |
| 7 | `app_seam_identity_lookup_owner` | предсессионный identity lookup | 2 |
| 8 | `app_seam_patient_invite_owner` | patient invite | 7 |
| 9 | `app_seam_org_invite_owner` | staff organization invite | 2 |
| 10 | `app_seam_specialist_provision_owner` | specialist/first-org provisioning | 11 |
| 11 | `app_seam_public_slug_owner` | public slug | 3 |
| 12 | `app_seam_public_booking_owner` | public booking resolver | 1 |
| 13 | `app_seam_dedicated_bot_owner` | dedicated bot resolver | 2 |
| 14 | `app_seam_payment_webhook_owner` | payment webhook | 3 |
| 15 | `app_seam_delivery_scope_owner` | delivery scope | 1 |
| 16 | `app_seam_patient_program_resolver_owner` | patient program resolver | 1 |
| 17 | `app_seam_settings_preauth_owner` | preauth settings | 7 |
| 18 | `app_seam_settings_integrator_owner` | integrator settings | 10 |
| 19 | `app_seam_settings_runtime_owner` | runtime settings | 5 |
| 20 | `app_seam_org_commerce_owner` | SaaS/org commerce | 8 |
| 21 | `app_seam_patient_org_projection_owner` | patient/org presentation projection | 4 |
| 22 | `app_seam_patient_booking_owner` | patient booking | 2 |
| 23 | `app_seam_patient_self_actions_owner` | patient self actions | 3 |
| 24 | `app_seam_reminder_patient_owner` | patient reminders | 8 |
| 25 | `app_seam_reminder_materialization_owner` | reminder materialization/discovery | 6 |
| 26 | `app_seam_reminder_specialist_owner` | specialist reminder | 4 |
| 27 | `app_seam_reminder_appointment_owner` | appointment reminder | 2 |
| 28 | `app_seam_reminder_email_cooldown_owner` | email cooldown | 2 |
| 29 | `app_seam_telemetry_patient_owner` | patient telemetry | 2 |
| 30 | `app_seam_telemetry_media_owner` | media telemetry | 2 |
| 31 | `app_seam_telemetry_operator_owner` | operator telemetry/probes | 12 |
| 32 | `app_seam_catalog_public_owner` | public catalogs | 2 |
| 33 | `app_seam_catalog_admin_owner` | clinical measure kinds | 3 |
| 34 | `app_seam_org_directory_owner` | platform org directory | 1 |
| 35 | `app_seam_telemetry_exclusion_owner` | telemetry exclusion | 2 |
| 36 | `saas_telemetry_owner` | SaaS isolation telemetry | 7 |
| 37 | `saas_system_health_owner` | curated system health | 4 |
| 38 | `app_seam_login_token_owner` | messenger login tokens | 5 |
| 39 | `app_seam_oauth_owner` | OAuth identity binding | 5 |
| 40 | `app_seam_phone_otp_owner` | phone OTP/challenges | 11 |
| 41 | `app_seam_staff_security_owner` | staff 2FA/TOTP/recovery | 12 |
| 42 | `app_seam_patient_lfk_media_owner` | patient LFK/platform-media entitlement | 4 |

Новые owners 38–42 нужны, потому что их bearer/credential/table surfaces не пересекаются с прежними швами:
слияние login token с password, OAuth с passkey, phone OTP с email OTP, staff TOTP с patient PIN либо media
entitlement с booking дало бы одной функции власть соседнего механизма входа или данных.

## 3. Все 112 вновь покрытых функций

Общее правило причины шва: caller не получает прямой ACL, потому что тогда он может выполнить произвольный SQL
над секретами/чужими строками. Фиксированный body ограничивает bearer/hash, exact user/org/queue, допустимые
переходы и атомарность. Ниже указана доказанная Q3/Q4 поверхность; общий column token при неоднозначном body не
превращается в grant — это помечено «не доказано» и остаётся до Ф7.

### 3.1 Расширения существующих швов

**Шов 2 — password auth (8).** `auth_rate_limit_count`, `auth_rate_limit_prune_key`,
`auth_rate_limit_prune_scope`, `auth_rate_limit_record`, `current_patient_has_password_credentials`,
`staff_user_has_password_credentials`, `set_staff_security_self_password_hash`,
`email_password_find_user_id_by_email_challenge`.

Поверхность: `auth_rate_limit_events RID(scope,key,occurred_at)`;
`user_password_credentials RU(user_id,password_hash,updated_at,failed_attempts,locked_until)`;
`email_challenges R(id,user_id)`. Rate-limit cutoff, password-hash mutation и credential existence должны выходить
только фиксированным результатом; caller нельзя дать чтение hashes или массовую очистку событий.

**Шов 3 — email OTP (17).** `email_auth_delete_email_challenge_by_id`,
`email_auth_delete_email_challenges_for_user`, `email_auth_find_email_challenge_for_confirm`,
`email_auth_find_email_challenge_for_consume`, `email_auth_find_email_owner_conflict`,
`email_auth_find_email_send_cooldown`, `email_auth_find_latest_email_challenge_for_user`,
`email_auth_find_latest_pending_email_challenge_for_user`, `email_auth_increment_email_challenge_attempts`,
`email_auth_insert_email_challenge`, `email_auth_set_email_challenge_purpose`,
`email_auth_upsert_email_send_cooldown`, `email_otp_public_find_email_send_cooldown_by_email`,
`email_otp_public_find_latest_email_challenge_by_email`, `email_auth_find_email_otp_lock`,
`email_auth_register_email_otp_lockout`, `email_auth_reset_email_otp_lockout`.

Поверхность: `email_challenges RIUD(id,user_id,email,code_hash,expires_at,attempts,created_at,purpose)`;
`email_send_cooldowns RI(user_id,email_normalized,last_sent_at)`; `email_otp_locks RID(user_id,locked_until,
lockout_cycle)`; `platform_users R(id,merged_into_id,email_normalized)`. Caller нельзя дать OTP hashes, изменение
attempt counter/lockout либо cross-user email lookup.

**Шов 5 — contact/channel binding (10).** `auth_channel_link_lock_unused_secret`,
`auth_channel_link_mark_secret_used`, `auth_channel_link_mark_secret_used_if_unused`,
`auth_channel_link_read_secret`, `auth_channel_link_replace_secret`, `auth_email_setup_delete`,
`auth_email_setup_insert`, `auth_email_setup_mark_used`, `auth_email_setup_read`,
`auth_email_setup_revoke_active`.

Поверхность: `channel_link_secrets RIUD(id,user_id,channel_code,token_hash,expires_at,used_at)`;
`user_email_setup_tokens RIUD(id,user_id,email_normalized,token_hash,expires_at,used_at,revoked_at,source,
created_by_user_id)`. Функции сохраняют opaque bearer lookup, одноразовость и exact user/channel; прямой доступ
позволил бы читать/подменять bearer hashes.

**Шов 6 — PIN/session security (4).** `auth_user_pin_increment_failed`, `auth_user_pin_read`,
`auth_user_pin_reset_attempts`, `auth_user_pin_upsert`; `user_pins RIU(user_id,pin_hash,attempts_failed,
locked_until,updated_at)`. Это тот же authority surface, что self-PIN функций evidence/25; caller не получает
PIN hashes и произвольный reset чужого lockout.

**Шов 10 — specialist provisioning (6).** `create_specialist_signup_intent`,
`get_latest_specialist_signup_intent_for_user`, `get_pending_specialist_signup_intent`,
`get_specialist_signup_intent_by_challenge`, `replace_pending_specialist_signup_challenge`,
`start_provisioned_organization_trial`.

Поверхность intents: `specialist_signup_intents RIU(id,user_id,challenge_id,email_normalized,organization_title,
specialist_full_name,status,provisioned_organization_id,provisioned_specialist_id,provisioned_membership_id,
created_at,organization_slug)`. Trial continuation: `saas_registration_tariff_policy R(key,tariff_id)`,
`saas_tariffs R(id,is_active)`, `saas_trial_policy R(key,duration_days,start_event,post_trial_behavior,
post_trial_tariff_id,is_active,discount_window_days)`, `saas_organization_trials I(organization_id,tariff_id,
started_at,ends_at,discount_ends_at,post_trial_behavior,post_trial_tariff_id,status,created_by)`,
`be_organizations U(id,tariff_id,updated_at)`, `admin_audit_log I(organization_id,actor_id,action,target_id,
details,status)`. Caller нельзя дать создание произвольного signup intent/trial, смену тарифа или audit write.

**Шов 11 — public slug (1).** `is_organization_slug_available`;
`organization_slug_claims R(slug)`. Это pre-session cross-tenant exact-slug test; прямой table read превратил бы
boolean в выгрузку каталога claims.

**Шов 17 — preauth settings (2).** `get_public_config_bool`, `is_smtp_outbound_configured`;
`system_settings R(key,scope,organization_id,value_json)`, только `specialist_signup_enabled` и boolean результата
проверки SMTP completeness. Caller не получает SMTP password или соседние settings.

**Шов 18 — integrator settings (5).** `read_integrator_clinic_delivery_credential`,
`read_integrator_google_calendar_setting`, `read_integrator_runtime_setting`, `read_operational_verbose_log_flag`,
`read_operator_health_probe_config`; `system_settings R(key,scope,organization_id,value_json)` с точными allowlists
из bodies. Здесь возможны provider credentials; прямой table access integrator-порту запрещён.

**Шов 21 — patient/org projection (2).** `current_patient_has_active_org_enrollment`,
`read_org_brand_core_context`; `org_enrollments R(organization_id,platform_user_id,status)`,
`be_organizations R(id,title,is_active)`. Policy одновременно требует signed patient/current org либо exact active
enrollment. Caller не получает произвольный directory организаций.

**Шов 25 — reminder discovery (1).** `list_web_push_reminder_organization_ids`;
`reminder_rules R(platform_user_id,integrator_user_id,is_enabled,organization_id)`,
`platform_users R(id,reminder_muted_until)`. Это cross-org scheduler scan; `USING(true)` допустима только этому
owner и этим колонкам, а не operational caller напрямую.

**Шов 31 — operator telemetry/probes (7).** `list_google_calendar_probe_organization_ids`,
`open_or_touch_operator_probe_incident`, `read_operator_outbound_probe_meta`,
`record_operational_delivery_attempt_audit`, `record_operator_outbound_probe_run`,
`resolve_operator_probe_incidents`, `read_outbound_provider_incident_health`.

Поверхность: `system_settings R(key,scope,organization_id,value_json,updated_at)` только calendar probe rows;
`operator_job_status RIU(job_key,job_family,last_status,last_started_at,last_finished_at,last_success_at,
last_failure_at,last_duration_ms,last_error,meta_json)`; `operator_incidents RU(id,dedup_key,direction,resolved_at,
acknowledged_at)`; `integrator.delivery_attempt_logs I(intent_type,intent_event_id,correlation_id,channel,status,
attempt,reason,payload_json,occurred_at)`. `open_or_touch_operator_probe_incident` сам таблицу не трогает, а вызывает
фиксированную функцию того же шва; его собственная потребность в table ACL **не доказана**. Probe caller не должен
получать произвольную запись incident/job/log.

**Шов 32 — public catalog (1).** `get_public_reference_baseline`;
`reference_catalog_baselines R(version,definition_json)`. Body отдаёт только одну разрешённую category projection,
не весь baseline JSON caller-у.

### 3.2 Уже выделенные внешние швы

**Шов 36 — SaaS isolation telemetry (7).** `read_last_saas_isolation_coverage`,
`read_saas_isolation_events`, `read_saas_isolation_test_scenario_fixture_counts`, `read_saas_isolation_trend`,
`record_saas_isolation_coverage`, `report_saas_isolation_event`, `set_saas_isolation_test_scenario`.

Поверхность: `saas_isolation_coverage_runs RID(id,status,started_at,finished_at,services_checked,checks_count,
unexpected_errors_count)`; `saas_isolation_events RIU(id,fingerprint,event_class,source_service,source_operation,
explanation_status,lifecycle_status,occurrence_count,first_seen_at,last_seen_at,resolved_at)`;
`saas_isolation_event_hourly RIU(event_id,bucket_start,occurrence_count)`. Это global telemetry: policy
`TO saas_telemetry_owner USING(true)` честна на этих трёх таблицах; test-fixture mutations дополнительно доступны
только на exact TEST. Runtime callers получают фиксированную reporting mutation, не таблицы.

**Шов 37 — system health (4).** `read_curated_playback_health`, `read_curated_playback_health_pre_0196`,
`read_curated_system_health`, `read_curated_system_health_pre_0196`. Полная named-column read surface Q4:
`media_hls_proxy_error_events(reason_code,created_at)`; `media_playback_resolution_events(delivery,fallback_used,
resolved_at)`; `media_playback_stats_hourly(bucket_hour,delivery,resolved_count,fallback_count)`;
`media_playback_user_video_first_resolve(first_resolved_at)`; `app_runtime_settings(key,scope,organization_id,
value_json,updated_at)`; `system_settings(key,scope,organization_id,value_json,updated_at)`;
`idempotency_keys(key,status,expires_at)`; `integration_webhook_last_status(source,received_at,processed_ok,
http_status_returned)`; `integrator_push_outbox(id,kind,status,next_try_at,created_at,updated_at)`;
`media_files(id,mime_type,size_bytes,created_at,s3_key,status,video_processing_status,
hls_master_playlist_s3_key,preview_status,organization_id)`; `media_transcode_jobs(id,media_id,status,created_at,
updated_at,processing_started_at,finished_at,organization_id)`; `notification_delivery_attempts(id,created_at,
user_id,channel,status,reason,provider_status_code,error_message,organization_id)`;
`operator_health_alert_sent(id,dedup_key,sent_at)`; `operator_incidents(id,dedup_key,last_seen_at,
occurrence_count,resolved_at)`; `operator_job_status(job_key,job_family,last_status,last_finished_at,last_success_at,
last_failure_at,last_duration_ms,meta_json)`; `outgoing_delivery_queue(id,kind,channel,status,next_retry_at,sent_at,
created_at,updated_at,failure_class,organization_id)`; `reminder_delivery_events(id,channel,status,created_at,
organization_id)`; `reminder_occurrence_history(id,status,occurred_at,created_at,organization_id)`;
`user_web_push_subscriptions(id,user_id,created_at,updated_at)`; `media_playback_client_events(media_id,
event_class,delivery,created_at)`. Это genuine cross-tenant aggregation: отдельный
`saas_system_health_owner NOBYPASSRLS` + named `SELECT` + per-table `USING(true)`, не BYPASS.

### 3.3 Пять новых швов

**Шов 38 — login token (5).** `auth_login_token_confirm`, `auth_login_token_create`,
`auth_login_token_expire_past`, `auth_login_token_mark_session_issued`, `auth_login_token_read`;
`login_tokens RIU(id,token_hash,user_id,method,status,confirmed_at,expires_at,session_issued_at)`. Это отдельная
bearer-capability поверхность messenger login; password/OTP owners не должны читать или подтверждать её.

**Шов 39 — OAuth (5).** `auth_oauth_find_user`, `auth_oauth_list_user_providers`,
`auth_oauth_upsert_binding`, `current_patient_has_web_oauth_binding`, `staff_user_has_web_oauth_binding`;
`user_oauth_bindings RI(user_id,provider,provider_user_id,email)`. Provider identity lookup/bind нельзя давать
password/passkey owners или caller-у как произвольный cross-user table access.

**Шов 40 — phone OTP (11).** `phone_auth_find_latest_challenge_created_at`, `phone_auth_find_otp_lock`,
`phone_auth_register_otp_lockout`, `phone_auth_reset_otp_lockout`, `phone_challenge_store_delete`,
`phone_challenge_store_delete_by_phone`, `phone_challenge_store_increment_attempts`,
`phone_challenge_store_read`, `phone_challenge_store_upsert`, `phone_otp_public_booking_consume_challenge`,
`phone_otp_public_booking_issue_challenge`.

Поверхность: `phone_challenges RIUD(challenge_id,phone,expires_at,code,channel_context,created_at,
verify_attempts)`; `phone_otp_locks RID(phone_normalized,locked_until,lockout_cycle)`. Body фиксирует TTL,
cooldown, attempts, single-use и public-booking intent; caller нельзя дать OTP code/store или сжигать чужой challenge.

**Шов 41 — staff security (12).** `begin_staff_login_challenge`, `complete_staff_totp_enrollment`,
`confirm_staff_recovery_codes`, `consume_staff_recovery_login`, `consume_staff_totp_login`,
`ensure_staff_security_profile`, `get_staff_security_profile`, `get_staff_security_session_state`,
`record_failed_staff_factor_attempt`, `require_staff_security_self_user_id`, `revoke_staff_sessions`,
`save_pending_staff_totp`.

Поверхность: `staff_security_profiles RIU(user_id,factor_type,totp_secret_ciphertext,
pending_totp_secret_ciphertext,factor_verified_at,recovery_code_hashes,recovery_codes_confirmed_at,
replacement_required,failed_attempts,locked_until,session_version,login_challenge_hash,
login_challenge_expires_at,updated_at)`. Policy — только signed self user. `require_staff_security_self_user_id`
не трогает таблицу: собственный table ACL ему **не доказан**; предпочтительная форма — invoker/accessor без
привилегии, а если остаётся definer, то у owner нулевая дополнительная поверхность. Caller нельзя дать TOTP
ciphertext, recovery hashes или изменение session version.

**Шов 42 — patient LFK/platform media (4).** `read_patient_lfk_complex_cover`,
`read_patient_lfk_complex_exercise_lines`, `read_platform_lfk_media_entitlement_refs`,
`read_platform_media_row`.

Поверхность: named `SELECT` на `lfk_complexes(id,user_id,title,platform_user_id,organization_id)`,
`lfk_complex_exercises(id,complex_id,exercise_id,sort_order,comment,local_comment,organization_id)`,
`lfk_exercises(id,title,organization_id,owner_kind)`, `lfk_exercise_media(id,exercise_id,media_url,media_type,
sort_order,created_at,organization_id,owner_kind)`, `lfk_complex_templates(id,status,organization_id,owner_kind)`,
`lfk_complex_template_exercises(id,template_id,exercise_id,organization_id,owner_kind)`,
`media_files(id,stored_path,mime_type,uploaded_by,s3_key,status,preview_status,preview_sm_key,preview_md_key,
video_processing_status,hls_master_playlist_s3_key,poster_s3_key,video_duration_seconds,
available_qualities_json,video_delivery_override,usage_purpose,organization_id,owner_kind)`. Patient reads требуют
current org+patient; platform media lookup допускает только `owner_kind='platform' AND organization_id IS NULL` и
подтверждённый entitlement. Caller нельзя дать глобальную media/LFK table surface.

## 4. Disposition 38 функций владельца-мигратора на TEST

| Целевой шов | Количество | Функции | Disposition |
|---|---:|---|---|
| 2 password auth | 2 | `current_patient_has_password_credentials`, `staff_user_has_password_credentials` | owner → `app_seam_password_auth_owner` |
| 3 email OTP | 14 | все `email_auth_*`/`email_otp_public_*` из owner-set, кроме password bridge | owner → `app_seam_email_otp_owner` |
| 2 password auth | 1 | `email_password_find_user_id_by_email_challenge` | owner → `app_seam_password_auth_owner` |
| 10 specialist provisioning | 5 | create/get/get/get/replace `specialist_signup_intent` | owner → `app_seam_specialist_provision_owner` |
| 17 preauth settings | 1 | `get_public_config_bool` | owner → `app_seam_settings_preauth_owner` |
| 31 operator telemetry | 1 | `read_outbound_provider_incident_health` | owner → `app_seam_telemetry_operator_owner` |
| 39 OAuth | 2 | `current_patient_has_web_oauth_binding`, `staff_user_has_web_oauth_binding` | owner → `app_seam_oauth_owner` |
| 41 staff security | 12 | полный staff 2FA/TOTP/recovery набор §3.3 | owner → `app_seam_staff_security_owner`; accessor без дополнительного table ACL |

Сумма — 38. Никакая функция не остаётся у `bersoncarebot_test`, и ownership login-роли не переносится в
декларацию. Удалять весь набор нельзя: bodies имеют живые auth/provisioning/health обязанности. Единственный
кандидат перестать быть definer — безтабличный `require_staff_security_self_user_id`; это не повод удалять его
контракт из кода, но привилегированного исполнения он не доказал.

## 5. Функция runtime-owner `app_platform_settings`

`app.start_provisioned_organization_trial()` выполняется с силой `app_platform_settings`. Body:

1. требует `app.current_patient_user_id()` и организацию из `app.current_provisioned_owner_organization()`;
2. `SELECT ... FOR UPDATE` глобальной `saas_registration_tariff_policy` и `saas_trial_policy`, проверяет active
   `saas_tariffs`;
3. вставляет `saas_organization_trials`;
4. обновляет `be_organizations.tariff_id/updated_at`;
5. вставляет `admin_audit_log`.

Таким образом runtime-role, владеющий этой definer-функцией, скрыто передаёт ей всю свою platform surface; это
ровно запрещённая конструкция. Правильный owner — `app_seam_specialist_provision_owner`: функция вызывается только
как атомарное продолжение первой организации, а его уже существующий шов в evidence/25 владеет provisioning и
теми же trial/org/audit отношениями. Новый шов не нужен. EXECUTE — только точному provisioning caller после signed
principal; у `app_platform_settings` ownership и EXECUTE по умолчанию отсутствуют.

## 6. `BYPASSRLS` и честные cross-tenant исключения

Вывод evidence/25 сохраняется на всех 244 функциях: **ноль функций требует `BYPASSRLS`**. Новые cross-tenant
случаи и их узкая форма:

- auth до сессии (2/3/5/7/11/17/38/39/40): policy exact owner на exact credential/lookup table, при необходимости
  `USING(true)`, но только named columns и exact input/hash predicate body;
- reminder discovery (25): `USING(true)` на named columns `reminder_rules`/`platform_users`;
- operator telemetry и SaaS isolation (31/36): `USING(true)` только на operator/telemetry tables;
- health (37): `USING(true)` только на перечисленных diagnostic columns;
- staff self (41), patient org/LFK (21/42): не cross-tenant; signed self/org predicates обязательны.

Owner каждого шва: `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`, без
членов и без владения таблицами. Временный migrator `BYPASSRLS` допустим только внутри migration window и снимается
до post-state, как уже определено evidence/25.

## 7. `EXECUTE TO PUBLIC`

Q5 дал **72 функции на DEV и 0 на TEST**. Число 25 из evidence/25 было только для 132 DEV-функций; расширение до
полного DEV-set добавляет ещё 47. TEST уже демонстрирует правильный default — PUBLIC отсутствует.

В целевой схеме `PUBLIC` не нужен даже для genuine pre-session body: pre-session всё равно приходит через один из
двух известных портов, поэтому EXECUTE выдаётся точной login/runtime-роли порта. Ниже каждая из 72 получает
однозначный disposition `REVOKE`; первая группа — кандидаты на последующий точный re-grant pre-session роли,
вторая — не public surface вообще. Live-run решает только именованный re-grant, не сохранение PUBLIC.

### 7.1 Genuine pre-session semantics: `PUBLIC REVOKE`, затем возможен exact-port re-grant

`auth_channel_link_lock_unused_secret`, `auth_channel_link_mark_secret_used`,
`auth_channel_link_mark_secret_used_if_unused`, `auth_channel_link_read_secret`, `auth_email_setup_mark_used`,
`auth_email_setup_read`, `auth_login_token_confirm`, `auth_login_token_create`,
`auth_login_token_mark_session_issued`, `auth_login_token_read`, `auth_oauth_find_user`,
`auth_oauth_upsert_binding`, `auth_rate_limit_count`, `auth_rate_limit_prune_key`,
`auth_rate_limit_prune_scope`, `auth_rate_limit_record`, `email_auth_find_email_otp_lock`,
`email_auth_register_email_otp_lockout`, `email_auth_reset_email_otp_lockout`, `get_public_reference_baseline`,
`get_web_push_vapid_public_key`, `is_organization_slug_available`, `is_smtp_outbound_configured`,
`phone_auth_find_latest_challenge_created_at`, `phone_auth_find_otp_lock`,
`phone_auth_register_otp_lockout`, `phone_auth_reset_otp_lockout`, `phone_challenge_store_delete`,
`phone_challenge_store_delete_by_phone`, `phone_challenge_store_increment_attempts`,
`phone_challenge_store_read`, `phone_challenge_store_upsert`, `phone_otp_public_booking_consume_challenge`,
`phone_otp_public_booking_issue_challenge`.

Итого в этой группе 34; наличие pre-session смысла защищает функцию как архитектурную поверхность, но не делает
весь кластер `PUBLIC` допустимым grantee.

### 7.2 Session/runtime/operator surface: `PUBLIC REVOKE`, без public re-grant

`auth_channel_link_replace_secret`, `auth_email_setup_delete`, `auth_email_setup_insert`,
`auth_email_setup_revoke_active`, `auth_login_token_expire_past`, `auth_oauth_list_user_providers`,
`bump_platform_user_session_epoch_self`, `current_patient_has_active_org_enrollment`,
`increment_media_playback_resolution_stat`, `is_current_patient_test_account`,
`is_platform_registration_analytics_user_excluded`, `list_scheduler_reminder_organization_ids`,
`list_web_push_reminder_organization_ids`, `mark_operator_incident_alert_sent`,
`operator_incident_alert_already_sent`, `propagate_staff_session_version_to_session_epoch`,
`read_current_patient_active_organizations`, `read_current_patient_appointment_history`,
`read_current_patient_booking_rows`, `read_current_patient_ui_setting`, `read_global_server_runtime_setting`,
`read_integrator_smtp_outbound_setting`, `read_media_worker_runtime_setting`, `read_org_brand_core_context`,
`read_outbound_provider_incident_health`, `read_patient_lfk_complex_cover`,
`read_patient_lfk_complex_exercise_lines`, `read_platform_lfk_media_entitlement_refs`, `read_platform_media_row`,
`record_current_patient_analytics_event`, `record_current_patient_push_open`,
`record_global_email_delivery_attempt`, `record_media_playback_resolution_event`,
`record_operator_delivery_attempt`, `resolve_current_patient_treatment_program_organization`,
`set_current_patient_calendar_timezone`, `touch_current_patient_plan_last_opened`,
`touch_current_patient_support_conversation_activity`.

Итого в этой группе 38; 34 + 38 = 72. Для каждой нужен exact caller из declaration, не PUBLIC.

## 8. Полный owner census

Таблица ниже — Q2/Q7: каждая из 244 identity signatures, DEV owner и TEST owner. `—` означает реальное отсутствие
сигнатуры на DEV, не неизвестное значение.

| Функция | DEV owner | TEST owner | Набор |
|---|---|---|---|
| `app.accept_org_invite(p_token_hash text, p_platform_user_id uuid, p_expected_email text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.advance_appointment_reminder_messenger_ladder(p_queue_id uuid, p_expected_attempt_count integer, p_error text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.apply_paid_saas_billing_tariff(p_saas_billing_invoice_id uuid, p_organization_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.apply_specialist_task_reminder_success_outcome(p_queue_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.auth_channel_link_lock_unused_secret(p_secret_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_channel_link_mark_secret_used(p_secret_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_channel_link_mark_secret_used_if_unused(p_secret_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_channel_link_read_secret(p_channel_code text, p_token_hash text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_channel_link_replace_secret(p_user_id uuid, p_channel_code text, p_token_hash text, p_expires_at timestamp with time zone)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_email_setup_delete(p_token_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_email_setup_insert(p_user_id uuid, p_email_normalized text, p_token_hash text, p_expires_at timestamp with time zone, p_source text, p_created_by_user_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_email_setup_mark_used(p_token_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_email_setup_read(p_token_hash text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_email_setup_revoke_active(p_user_id uuid, p_email_normalized text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_login_token_confirm(p_token_hash text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_login_token_create(p_token_hash text, p_user_id uuid, p_method text, p_expires_at timestamp with time zone)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_login_token_expire_past()` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_login_token_mark_session_issued(p_token_hash text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_login_token_read(p_token_hash text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_oauth_find_user(p_provider text, p_provider_user_id text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_oauth_list_user_providers(p_user_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_oauth_upsert_binding(p_user_id uuid, p_provider text, p_provider_user_id text, p_email text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_phone_bind_lock_channel_binding(p_channel_code text, p_external_id text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.auth_phone_bind_upsert_channel_binding(p_user_id uuid, p_channel_code text, p_external_id text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.auth_rate_limit_count(p_scope text, p_key text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_rate_limit_prune_key(p_scope text, p_key text, p_cutoff timestamp with time zone)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_rate_limit_prune_scope(p_scope text, p_cutoff timestamp with time zone, p_batch_size integer)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_rate_limit_record(p_scope text, p_key text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_user_pin_increment_failed(p_user_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_user_pin_read(p_user_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_user_pin_read_self()` | `app_owner` | `app_owner` | evidence/25 |
| `app.auth_user_pin_reset_attempts(p_user_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_user_pin_upsert(p_user_id uuid, p_pin_hash text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.auth_user_pin_upsert_self(p_pin_hash text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.begin_staff_login_challenge(p_challenge_hash text, p_expires_at timestamp with time zone)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.bump_platform_user_session_epoch_self()` | `app_owner` | `app_owner` | evidence/25 |
| `app.cancel_patient_invite_email_proof(p_continuation_hash text, p_code_hash text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.choose_organization_first_tariff(p_tariff_id uuid, p_actor_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.claim_unbound_patient_invite_email(p_continuation_hash text, p_email_normalized text, p_authorization_nonce text, p_authorization_expires_epoch bigint, p_authorization_signature text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.close_active_user_phone_history(p_user uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.complete_staff_totp_enrollment(p_secret_ciphertext text, p_recovery_code_hashes jsonb)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.confirm_staff_recovery_codes()` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.consume_staff_recovery_login(p_challenge_hash text, p_recovery_code_hash text)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.consume_staff_totp_login(p_challenge_hash text)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.create_specialist_signup_intent(p_challenge_id uuid, p_email_normalized text, p_organization_title text, p_specialist_full_name text, p_organization_slug text)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.current_integrator_user_id()` | `app_owner` | `app_owner` | evidence/25 |
| `app.current_org_id()` | `app_owner` | `app_owner` | evidence/25 |
| `app.current_patient_has_active_org_enrollment(p_organization_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.current_patient_has_password_credentials()` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.current_patient_has_web_oauth_binding()` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.current_patient_user_id()` | `app_owner` | `app_owner` | evidence/25 |
| `app.current_provisioned_owner_organization()` | `app_owner` | `app_owner` | evidence/25 |
| `app.email_auth_delete_email_challenge_by_id(p_challenge_id uuid)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.email_auth_delete_email_challenges_for_user(p_user_id uuid)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.email_auth_enqueue_otp_delivery(p_challenge_id uuid, p_delivery_token uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.email_auth_find_email_challenge_for_confirm(p_challenge_id uuid, p_user_id uuid)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.email_auth_find_email_challenge_for_consume(p_challenge_id uuid, p_user_id uuid)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.email_auth_find_email_otp_lock(p_user_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.email_auth_find_email_owner_conflict(p_user_id uuid, p_email text)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.email_auth_find_email_send_cooldown(p_user_id uuid, p_email_norm text)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.email_auth_find_latest_email_challenge_for_user(p_user_id uuid, p_now_sec bigint)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.email_auth_find_latest_pending_email_challenge_for_user(p_user_id uuid, p_now_sec bigint)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.email_auth_increment_email_challenge_attempts(p_challenge_id uuid)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.email_auth_insert_email_challenge(p_user_id uuid, p_email text, p_code_hash text, p_expires_at bigint)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.email_auth_register_email_otp_lockout(p_user_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.email_auth_reset_email_otp_lockout(p_user_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.email_auth_set_email_challenge_delivery_code(p_challenge_id uuid, p_code text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.email_auth_set_email_challenge_purpose(p_challenge_id uuid, p_purpose text)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.email_auth_upsert_email_send_cooldown(p_user_id uuid, p_email_norm text)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.email_auth_verify_user_email(p_user_id uuid, p_email text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.email_otp_public_consume_latest_challenge(p_email_normalized text, p_code_hash text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.email_otp_public_delete_unverified_registration(p_user_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.email_otp_public_find_email_send_cooldown_by_email(p_email_norm text)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.email_otp_public_find_latest_email_challenge_by_email(p_email_norm text, p_now_sec bigint)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.email_otp_public_find_or_create_user(p_email_norm text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.email_otp_public_find_user_by_email(p_email_norm text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.email_otp_public_register_patient(p_email_norm text, p_last_name text, p_first_name text, p_patronymic text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.email_password_delete_unverified_registration(p_user_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.email_password_find_login_candidate(p_email_norm text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.email_password_find_user_id_by_email_challenge(p_challenge_id uuid)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.email_password_register_pending(p_email_norm text, p_password_hash text, p_last_name text, p_first_name text, p_patronymic text, p_role text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.ensure_staff_security_profile()` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.exchange_patient_invite(p_token_hash text, p_continuation_hash text, p_continuation_expires_at timestamp with time zone)` | `app_owner` | `app_owner` | evidence/25 |
| `app.find_platform_user_ids_by_any_confirmed_email(p_email_norm text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.get_latest_specialist_signup_intent_for_user()` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.get_pending_specialist_signup_intent(p_user_id uuid, p_challenge_id uuid)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.get_preferred_auth_channel_code(p_user_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.get_public_config_bool(p_key text)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.get_public_reference_baseline(p_category_code text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.get_specialist_signup_intent_by_challenge(p_challenge_id uuid)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.get_staff_security_profile()` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.get_staff_security_session_state()` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.get_web_push_vapid_public_key()` | `app_owner` | `app_owner` | evidence/25 |
| `app.increment_media_playback_resolution_stat(p_user_id uuid, p_media_id uuid, p_delivery text, p_fallback_used boolean)` | `app_owner` | `app_owner` | evidence/25 |
| `app.install_signed_context(p_nonce text, p_backend_pid integer, p_expires_epoch bigint, p_org_id uuid, p_patient_user_id uuid, p_integrator_user_id bigint, p_signature_hex text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.is_current_patient_test_account()` | `app_owner` | `app_owner` | evidence/25 |
| `app.is_max_bot_configured()` | `app_owner` | `app_owner` | evidence/25 |
| `app.is_organization_slug_available(p_slug text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.is_platform_registration_analytics_user_excluded(p_user_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.is_sms_provider_configured()` | `app_owner` | `app_owner` | evidence/25 |
| `app.is_smtp_outbound_configured()` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.is_telegram_login_configured()` | `app_owner` | `app_owner` | evidence/25 |
| `app.list_active_booking_cities()` | `app_owner` | `app_owner` | evidence/25 |
| `app.list_clinical_test_measure_kinds()` | `app_owner` | `app_owner` | evidence/25 |
| `app.list_google_calendar_probe_organization_ids()` | — | `app_owner` | new; TEST-only |
| `app.list_platform_organization_members(p_organization_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.list_scheduler_reminder_organization_ids()` | `app_owner` | `app_owner` | evidence/25 |
| `app.list_web_push_reminder_organization_ids(p_now timestamp with time zone)` | `app_web_push_reminder_discovery_definer` | `app_web_push_reminder_discovery_definer` | new |
| `app.lookup_patient_invite_continuation(p_continuation_hash text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.lookup_pending_org_invite(p_token_hash text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.mark_operator_incident_alert_sent(p_incident_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.mark_patient_reminder_occurrence_queued(p_occurrence_id text, p_generation integer, p_event_ids text[])` | `app_owner` | `app_owner` | evidence/25 |
| `app.open_or_touch_operator_incident(p_dedup_key text, p_direction text, p_integration text, p_error_class text, p_error_detail text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.open_or_touch_operator_probe_incident(p_integration text, p_error_class text, p_error_detail text)` | — | `app_owner` | new; TEST-only |
| `app.operator_incident_alert_already_sent(p_incident_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.passkey_complete_authentication(p_challenge_id uuid, p_credential_id text, p_previous_counter bigint, p_new_counter bigint, p_device_type text, p_backed_up boolean)` | `app_owner` | `app_owner` | evidence/25 |
| `app.passkey_complete_registration(p_challenge_id uuid, p_user_id uuid, p_credential_id text, p_public_key text, p_counter bigint, p_transports jsonb, p_device_type text, p_backed_up boolean)` | `app_owner` | `app_owner` | evidence/25 |
| `app.passkey_delete_current_credential(p_credential_id text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.passkey_get_or_create_account(p_user_id uuid, p_candidate_handle text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.passkey_issue_challenge(p_id uuid, p_purpose text, p_user_id uuid, p_challenge text, p_expected_origin text, p_rp_id text, p_expires_at timestamp with time zone)` | `app_owner` | `app_owner` | evidence/25 |
| `app.passkey_list_current_credentials()` | `app_owner` | `app_owner` | evidence/25 |
| `app.passkey_list_current_exclusions()` | `app_owner` | `app_owner` | evidence/25 |
| `app.passkey_read_challenge(p_id uuid, p_purpose text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.passkey_read_credential(p_credential_id text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.password_credentials_replace_self(p_email_normalized text, p_password_hash text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.password_credentials_upsert_self(p_email_normalized text, p_password_hash text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.password_login_acquire(p_email_normalized text, p_identifier_key text, p_altcha_challenge_id uuid, p_altcha_challenge_digest text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.password_login_complete(p_lease_token uuid, p_password_verified boolean)` | `app_owner` | `app_owner` | evidence/25 |
| `app.password_login_issue_altcha_challenge(p_email_normalized text, p_challenge_id uuid, p_challenge_digest text, p_expires_at timestamp with time zone)` | `app_owner` | `app_owner` | evidence/25 |
| `app.password_login_read_altcha_secret()` | `app_owner` | `app_owner` | evidence/25 |
| `app.patient_cancel_pending_reminder_occurrences(p_rule_id text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.patient_disable_reminder_messenger_topic(p_integrator_occurrence_id text, p_messenger_channel text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.patient_done_reminder_occurrence(p_integrator_occurrence_id text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.patient_reminder_materialization_fingerprint(p_occurrence_id text, p_channel text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.patient_reminder_notification_settings(p_messenger_channel text, p_toggle_topic_code text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.patient_set_reminder_mute(p_minutes integer, p_until_tomorrow boolean)` | `app_owner` | `app_owner` | evidence/25 |
| `app.patient_set_reminder_muted_until(p_muted_until timestamp with time zone)` | `app_owner` | `app_owner` | evidence/25 |
| `app.patient_skip_reminder_occurrence(p_platform_user_id uuid, p_integrator_occurrence_id text, p_reason text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.patient_snooze_reminder_occurrence(p_platform_user_id uuid, p_integrator_occurrence_id text, p_minutes integer)` | `app_owner` | `app_owner` | evidence/25 |
| `app.phone_auth_find_latest_challenge_created_at(p_phone text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.phone_auth_find_otp_lock(p_phone text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.phone_auth_register_otp_lockout(p_phone text, p_now_sec bigint)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.phone_auth_reset_otp_lockout(p_phone text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.phone_challenge_store_delete(p_challenge_id text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.phone_challenge_store_delete_by_phone(p_phone text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.phone_challenge_store_increment_attempts(p_challenge_id text, p_now_sec bigint)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.phone_challenge_store_read(p_challenge_id text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.phone_challenge_store_upsert(p_challenge_id text, p_phone text, p_expires_at bigint, p_code text, p_channel_context jsonb, p_verify_attempts integer)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.phone_otp_public_booking_consume_challenge(p_challenge_id text, p_code text, p_max_attempts integer, p_lock_duration_sec integer)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.phone_otp_public_booking_issue_challenge(p_phone text, p_challenge_id text, p_code text, p_ttl_sec integer, p_resend_cooldown_sec integer, p_delivery_channel text, p_intent jsonb)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.prepare_organization_lifecycle_notification_context(p_organization_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.propagate_staff_session_version_to_session_epoch()` | `app_owner` | `app_owner` | evidence/25 |
| `app.provision_specialist_owner(p_challenge_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_curated_playback_health()` | `saas_system_health_owner` | `saas_system_health_owner` | new |
| `app.read_curated_playback_health_pre_0196()` | `saas_system_health_owner` | `saas_system_health_owner` | new |
| `app.read_curated_system_health()` | `saas_system_health_owner` | `saas_system_health_owner` | new |
| `app.read_curated_system_health_pre_0196()` | `saas_system_health_owner` | `saas_system_health_owner` | new |
| `app.read_current_org_tariff_transition_usage()` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_current_patient_active_organizations()` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_current_patient_appointment_history()` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_current_patient_booking_rows(p_kind text, p_now timestamp with time zone)` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_current_patient_organization_entitlements()` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_current_patient_ui_setting(p_key text, p_scope text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_global_server_runtime_setting(p_key text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_integrator_auth_channel_setting(p_key text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_integrator_clinic_delivery_credential(p_key text, p_organization_id uuid)` | — | `app_owner` | new; TEST-only |
| `app.read_integrator_google_calendar_setting(p_key text, p_organization_id uuid)` | — | `app_owner` | new; TEST-only |
| `app.read_integrator_platform_integration_availability()` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_integrator_provider_runtime_setting(p_key text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_integrator_runtime_setting(p_key text)` | — | `app_owner` | new; TEST-only |
| `app.read_integrator_smtp_outbound_setting()` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_last_saas_isolation_coverage()` | `saas_telemetry_owner` | `saas_telemetry_owner` | new |
| `app.read_media_worker_runtime_setting(p_key text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_operational_verbose_log_flag()` | — | `app_owner` | new; TEST-only |
| `app.read_operator_health_probe_config()` | — | `app_owner` | new; TEST-only |
| `app.read_operator_outbound_probe_meta()` | — | `app_owner` | new; TEST-only |
| `app.read_org_brand_core_context(p_organization_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.read_org_enforced_quota_usage(p_organization_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_outbound_provider_incident_health()` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.read_outgoing_delivery_reclaim_config()` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_patient_lfk_complex_cover(p_complex_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.read_patient_lfk_complex_exercise_lines(p_complex_ids uuid[])` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.read_platform_lfk_media_entitlement_refs(p_media_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.read_platform_media_row(p_media_id uuid)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.read_public_runtime_setting(p_key text, p_scope text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_reminder_transactional_email_cooldown(p_user_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_saas_billing_payment_provider()` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_saas_isolation_events()` | `saas_telemetry_owner` | `saas_telemetry_owner` | new |
| `app.read_saas_isolation_test_scenario_fixture_counts()` | — | `saas_telemetry_owner` | new; TEST-only |
| `app.read_saas_isolation_trend()` | `saas_telemetry_owner` | `saas_telemetry_owner` | new |
| `app.read_webapp_preauth_provider_setting(p_key text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.read_webapp_server_runtime_setting(p_key text, p_scope text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.record_current_patient_analytics_event(p_occurred_at timestamp with time zone, p_event_type text, p_entry_channel text, p_page_key text, p_client_session_id text, p_metadata jsonb)` | `app_owner` | `app_owner` | evidence/25 |
| `app.record_current_patient_push_open(p_occurred_at timestamp with time zone, p_entry_channel text, p_push_tracking_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.record_failed_staff_factor_attempt()` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.record_global_email_delivery_attempt(p_intent_type text, p_intent_event_id text, p_correlation_id text, p_channel text, p_status text, p_attempt integer, p_reason text, p_payload_json jsonb, p_occurred_at timestamp with time zone)` | `app_owner` | `app_owner` | evidence/25 |
| `app.record_media_playback_resolution_event(p_user_id uuid, p_media_id uuid, p_delivery text, p_fallback_used boolean)` | `app_owner` | `app_owner` | evidence/25 |
| `app.record_operational_delivery_attempt_audit(p_intent_type text, p_intent_event_id text, p_correlation_id text, p_channel text, p_status text, p_attempt integer, p_reason text, p_payload_json jsonb, p_occurred_at timestamp with time zone)` | — | `app_owner` | new; TEST-only |
| `app.record_operator_delivery_attempt(p_intent_event_id text, p_channel text, p_status text, p_attempt integer, p_reason text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.record_operator_outbound_probe_run(p_last_status text, p_finished_at timestamp with time zone, p_last_error text, p_meta_json jsonb)` | — | `app_owner` | new; TEST-only |
| `app.record_reminder_transactional_email_cooldown(p_user_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.record_saas_isolation_coverage(p_id uuid, p_status text, p_started_at timestamp with time zone, p_finished_at timestamp with time zone, p_services_checked text[], p_checks_count integer, p_unexpected_errors_count integer)` | `saas_telemetry_owner` | `saas_telemetry_owner` | new |
| `app.redeem_patient_invite_email(p_continuation_hash text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.refresh_specialist_task_reminder_materialization(p_event_id text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.release_principal_context()` | `app_owner` | `app_owner` | evidence/25 |
| `app.replace_pending_specialist_signup_challenge(p_challenge_id uuid, p_organization_slug text)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.report_saas_isolation_event(p_event_class text, p_source_service text, p_source_operation text, p_explanation_status text)` | `saas_telemetry_owner` | `saas_telemetry_owner` | new |
| `app.require_staff_security_self_user_id()` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.reset_principal_context()` | `app_owner` | `app_owner` | evidence/25 |
| `app.resolve_clinic_dedicated_bot_organization(p_channel text, p_credential_fingerprint text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.resolve_current_patient_treatment_program_organization(p_instance_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.resolve_operator_probe_incidents(p_dedup_key_prefix text)` | — | `app_owner` | new; TEST-only |
| `app.resolve_organization_cabinet_access(p_organization_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.resolve_organization_mechanic_access(p_organization_id uuid, p_mechanic text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.resolve_outgoing_delivery_scope(p_queue_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.resolve_payment_webhook_organization(p_provider_id text, p_idempotency_key text, p_event_type text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.resolve_public_booking_organization(p_branch_id uuid, p_service_id uuid, p_branch_service_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.resolve_public_organization_by_slug(p_slug text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.resolve_public_organization_slug(p_slug text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.resolve_saas_billing_invoice_for_webhook(p_provider_id text, p_provider_invoice_ref text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.revalidate_appointment_reminder_materialization(p_queue_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.revalidate_patient_reminder_delivery_materialization(p_queue_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.revalidate_specialist_task_reminder_materialization(p_queue_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.revoke_staff_sessions()` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.saas_billing_effective_tariff(p_organization_id uuid, p_tariff_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.saas_billing_effective_tariff_for_current_org(p_organization_id uuid, p_tariff_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.save_clinical_test_measure_kinds(p_items jsonb)` | `app_owner` | `app_owner` | evidence/25 |
| `app.save_pending_staff_totp(p_secret_ciphertext text)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.seed_reference_catalog_after_organization_insert()` | `app_owner` | `app_owner` | evidence/25 |
| `app.seed_reference_catalog_snapshot(p_organization_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.set_current_patient_calendar_timezone(p_value text, p_only_if_empty boolean)` | `app_owner` | `app_owner` | evidence/25 |
| `app.set_saas_isolation_test_scenario(p_scenario text)` | — | `saas_telemetry_owner` | new; TEST-only |
| `app.set_staff_security_self_password_hash(p_password_hash text)` | `bcb_webapp_dev_user` | `app_owner` | new |
| `app.specialist_task_reminder_materialization_fingerprint(p_task_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.staff_user_has_password_credentials(p_user_id uuid)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.staff_user_has_web_oauth_binding(p_user_id uuid)` | `bcb_webapp_dev_user` | `bersoncarebot_test` | new |
| `app.start_patient_invite_email_proof(p_continuation_hash text, p_email_normalized text, p_code_hash text, p_proof_expires_at timestamp with time zone, p_authorization_nonce text, p_authorization_expires_epoch bigint, p_authorization_signature text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.start_provisioned_organization_trial()` | `app_platform_settings` | `app_platform_settings` | new |
| `app.sync_clinic_dedicated_bot_binding()` | `app_owner` | `app_owner` | evidence/25 |
| `app.touch_current_patient_plan_last_opened(p_instance_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.touch_current_patient_support_conversation_activity(p_message_id uuid)` | `app_owner` | `app_owner` | evidence/25 |
| `app.upsert_clinical_test_measure_kind_by_label(p_label text)` | `app_owner` | `app_owner` | evidence/25 |
| `app.upsert_patient_reminder_occurrence_plan(p_occurrence_id text, p_rule_id text, p_organization_id uuid, p_platform_user_id uuid, p_occurrence_key text, p_planned_at timestamp with time zone)` | `app_owner` | `app_owner` | evidence/25 |
| `app.verify_patient_invite_email_proof(p_continuation_hash text, p_email_normalized text, p_code_hash text, p_authorization_nonce text, p_authorization_expires_epoch bigint, p_authorization_signature text)` | `app_owner` | `app_owner` | evidence/25 |

## 9. Команды доказательства

### Q0 — exact database gate

```bash
set -a
. /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
set +a
dev_url="$DATABASE_URL"
test_url="${DATABASE_URL%/*}/bersoncarebot_test"
for db_url in "$dev_url" "$test_url"; do
  psql "$db_url" -X -v ON_ERROR_STOP=1 -At <<'SQL'
BEGIN TRANSACTION READ ONLY;
SELECT current_database(),current_user,inet_server_addr(),inet_server_port();
ROLLBACK;
SQL
done
```

Результат: `bcb_webapp_dev|bcb_webapp_dev_user|127.0.0.1|5432` и
`bersoncarebot_test|bcb_webapp_dev_user|127.0.0.1|5432`.

### Q1 — owners и total каждой базы

```sql
BEGIN TRANSACTION READ ONLY;
SELECT pg_get_userbyid(p.proowner),count(*)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosecdef AND n.nspname IN ('app','public','integrator','app_ext')
GROUP BY p.proowner ORDER BY count(*) DESC,1;
SELECT count(*)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosecdef AND n.nspname IN ('app','public','integrator','app_ext');
ROLLBACK;
```

### Q2 — signature/owner/body reconciliation

Для каждой базы команда ниже выводилась с tab separator, сортировалась по первому полю и сравнивалась `comm` /
`join`; команды `wc -l` дали `231 0 13`, а `awk` над join — `owner=88 body=10 either=97`.

```sql
SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
       pg_get_userbyid(p.proowner),md5(pg_get_functiondef(p.oid))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosecdef AND n.nspname IN ('app','public','integrator','app_ext')
ORDER BY 1;
```

Точные агрегаторы над двумя отсортированными выводами `q_catalog`:

```bash
printf '%s %s %s\n' \
  "$(comm -12 <(q_catalog "$dev_url" | cut -f1) <(q_catalog "$test_url" | cut -f1) | wc -l)" \
  "$(comm -23 <(q_catalog "$dev_url" | cut -f1) <(q_catalog "$test_url" | cut -f1) | wc -l)" \
  "$(comm -13 <(q_catalog "$dev_url" | cut -f1) <(q_catalog "$test_url" | cut -f1) | wc -l)"

join -t $'\t' -j 1 <(q_catalog "$dev_url") <(q_catalog "$test_url") \
  | awk -F '\t' 'BEGIN{o=0;b=0;e=0} {
      if($2!=$4)o++; if($3!=$5)b++; if($2!=$4||$3!=$5)e++
    } END{print o,b,e}'
```

### Q3 — bodies всех 112 новых функций

Baseline names брал тот же запрос для `bcb_webapp_dev`, ограниченный `owner='app_owner'`:

```bash
baseline_names="$(psql "$dev_url" -X -v ON_ERROR_STOP=1 -At -c \
  "SELECT string_agg(quote_literal(p.proname),',' ORDER BY p.proname)
   FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.prosecdef AND r.rolname='app_owner'
     AND n.nspname IN ('app','public','integrator','app_ext')")"

psql "$test_url" -X -v ON_ERROR_STOP=1 -At -c \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.prosecdef AND n.nspname IN ('app','public','integrator','app_ext')
     AND p.proname NOT IN ($baseline_names)"
```

Результат второй команды: `112`. Полный body query на TEST использовал тот же shell-expanded
`$baseline_names`:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
       pg_get_userbyid(p.proowner),pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosecdef AND n.nspname IN ('app','public','integrator','app_ext')
  AND p.proname NOT IN ($baseline_names)
ORDER BY 2,3;
ROLLBACK;
```

Q3 вернул 112 строк; каждый body прочитан через `pg_get_functiondef()`, включая отдельный полный вывод
`start_provisioned_organization_trial()`.

### Q4 — relation operations и доказанные column tokens

```sql
BEGIN TRANSACTION READ ONLY;
WITH funcs AS (
  SELECT p.oid,p.proname,lower(pg_get_functiondef(p.oid)) def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prosecdef AND n.nspname IN ('app','public','integrator','app_ext')
    AND p.proname NOT IN ($baseline_names)
), rels AS (
  SELECT c.oid,n.nspname,c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('app','public','integrator','app_ext') AND c.relkind IN ('r','p')
)
SELECT f.proname,r.nspname,r.relname,a.attname
FROM funcs f JOIN rels r ON strpos(f.def,lower(r.nspname||'.'||r.relname))>0
JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
WHERE f.def ~ ('\m'||lower(a.attname)||'\M')
ORDER BY f.proname,r.nspname,r.relname,a.attnum;
ROLLBACK;
```

R/I/U/D определялись теми же четырьмя anchored regex из evidence/25 Q3. Это lexical upper bound; неоднозначное
имя колонки не становится grant.

### Q5 — `PUBLIC EXECUTE`

Одна и та же команда на обеих базах дала DEV `72|231`, TEST `0|244`:

```sql
BEGIN TRANSACTION READ ONLY;
WITH funcs AS (
 SELECT p.oid,p.proacl,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prosecdef AND n.nspname IN ('app','public','integrator','app_ext')
), expanded AS (
 SELECT DISTINCT f.oid,x.grantee FROM funcs f
 CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) x
 WHERE x.privilege_type='EXECUTE'
)
SELECT count(DISTINCT oid) FILTER (WHERE grantee=0),count(DISTINCT oid) FROM expanded;
ROLLBACK;
```

### Q6 — сумма функций в 42 швах

Перед суммой Q6A классифицировал фактические 112 новые TEST-сигнатуры. Полный `CASE` — это точная машинная
редакция списков §3; результат не содержал seam `0`/`UNMAPPED`:

```sql
WITH new_funcs AS (
 SELECT p.proname,pg_get_userbyid(p.proowner) owner
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prosecdef AND n.nspname IN ('app','public','integrator','app_ext')
   AND p.proname NOT IN ($baseline_names)
), mapped AS (
 SELECT proname,owner,CASE
  WHEN proname LIKE 'auth_rate_limit_%' OR proname IN
    ('current_patient_has_password_credentials','staff_user_has_password_credentials',
     'set_staff_security_self_password_hash','email_password_find_user_id_by_email_challenge') THEN 2
  WHEN proname LIKE 'email_auth_%' OR proname LIKE 'email_otp_public_%' THEN 3
  WHEN proname LIKE 'auth_channel_link_%' OR proname LIKE 'auth_email_setup_%' THEN 5
  WHEN proname LIKE 'auth_user_pin_%' THEN 6
  WHEN proname IN ('create_specialist_signup_intent','get_latest_specialist_signup_intent_for_user',
    'get_pending_specialist_signup_intent','get_specialist_signup_intent_by_challenge',
    'replace_pending_specialist_signup_challenge','start_provisioned_organization_trial') THEN 10
  WHEN proname='is_organization_slug_available' THEN 11
  WHEN proname IN ('get_public_config_bool','is_smtp_outbound_configured') THEN 17
  WHEN proname IN ('read_integrator_clinic_delivery_credential','read_integrator_google_calendar_setting',
    'read_integrator_runtime_setting','read_operational_verbose_log_flag','read_operator_health_probe_config') THEN 18
  WHEN proname IN ('current_patient_has_active_org_enrollment','read_org_brand_core_context') THEN 21
  WHEN proname='list_web_push_reminder_organization_ids' THEN 25
  WHEN proname IN ('list_google_calendar_probe_organization_ids','open_or_touch_operator_probe_incident',
    'read_operator_outbound_probe_meta','record_operational_delivery_attempt_audit',
    'record_operator_outbound_probe_run','resolve_operator_probe_incidents',
    'read_outbound_provider_incident_health') THEN 31
  WHEN proname='get_public_reference_baseline' THEN 32
  WHEN owner='saas_telemetry_owner' THEN 36
  WHEN owner='saas_system_health_owner' THEN 37
  WHEN proname LIKE 'auth_login_token_%' THEN 38
  WHEN proname LIKE 'auth_oauth_%' OR proname IN
    ('current_patient_has_web_oauth_binding','staff_user_has_web_oauth_binding') THEN 39
  WHEN proname LIKE 'phone_%' THEN 40
  WHEN proname IN ('begin_staff_login_challenge','complete_staff_totp_enrollment',
    'confirm_staff_recovery_codes','consume_staff_recovery_login','consume_staff_totp_login',
    'ensure_staff_security_profile','get_staff_security_profile','get_staff_security_session_state',
    'record_failed_staff_factor_attempt','require_staff_security_self_user_id','revoke_staff_sessions',
    'save_pending_staff_totp') THEN 41
  WHEN proname IN ('read_patient_lfk_complex_cover','read_patient_lfk_complex_exercise_lines',
    'read_platform_lfk_media_entitlement_refs','read_platform_media_row') THEN 42
  ELSE 0 END seam FROM new_funcs
)
SELECT seam,count(*),count(*) FILTER (WHERE owner='bersoncarebot_test') AS migrator_owned
FROM mapped GROUP BY seam ORDER BY seam;
```

Результат Q6A по seam:
`2:8/3; 3:17/14; 5:10/0; 6:4/0; 10:6/5; 11:1/0; 17:2/1; 18:5/0; 21:2/0;
25:1/0; 31:7/1; 32:1/0; 36:7/0; 37:4/0; 38:5/0; 39:5/2; 40:11/0; 41:12/12; 42:4/0`,
где после `/` — функции владельца-мигратора. Суммы колонок — 112 и 38.

```bash
printf '%s\n' 6 17 25 9 13 8 2 7 2 11 3 1 2 3 1 1 7 10 5 8 4 2 3 8 6 4 2 2 2 2 12 2 3 1 2 7 4 5 5 11 12 4 \
  | awk '{s+=$1} END{print s}'
```

Результат: `244`.

Списки §7 проверены против live DEV PUBLIC-set; команда дала `34 38`, а оба `comm` были пусты:

```bash
actual_public_pronames() {
  psql "$dev_url" -X -v ON_ERROR_STOP=1 -At <<'SQL'
WITH funcs AS (
 SELECT p.oid,p.proname,p.proacl,p.proowner FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prosecdef AND n.nspname IN ('app','public','integrator','app_ext')
)
SELECT DISTINCT f.proname FROM funcs f
CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) x
WHERE x.privilege_type='EXECUTE' AND x.grantee=0 ORDER BY 1;
SQL
}
documented_public_pronames() {
  sed -n '/^### 7\.1 /,/^## 8\./p' \
    docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/30-definer-seams-full-census.md \
    | rg -o '`[a-z][a-z0-9_]+`' | tr -d '`' | sort -u
}
for section in '7.1' '7.2'; do
  sed -n "/^### $section /,/^### 7\.[12]\|^## 8\./p" \
    docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/30-definer-seams-full-census.md \
    | rg -o '`[a-z][a-z0-9_]+`' | tr -d '`' | sort -u | wc -l
done
comm -23 <(actual_public_pronames) <(documented_public_pronames)
comm -13 <(actual_public_pronames) <(documented_public_pronames)
```

### Q7 — полный owner census

Q2 без body hash, `join -a 2` по identity signature. Получено 244 строки таблицы §8.

### R1 — источник TEST-only/gap функций

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' \
  'list_google_calendar_probe_organization_ids|open_or_touch_operator_probe_incident|read_integrator_clinic_delivery_credential|read_integrator_google_calendar_setting|read_integrator_runtime_setting|read_operational_verbose_log_flag|read_operator_health_probe_config|read_operator_outbound_probe_meta|read_saas_isolation_test_scenario_fixture_counts|record_operational_delivery_attempt_audit|record_operator_outbound_probe_run|resolve_operator_probe_incidents|set_saas_isolation_test_scenario' \
  apps deploy scripts docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD
```

Результат: 11 runtime-функций определены C4/integrator overlays и имеют callers; две fixture-функции определены
только `test-saas-isolation-telemetry-fixtures.sql` и имеют exact-TEST guard.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. Выбор конкретного body при десяти deployment drifts — обязанность принятой migration chain/live-run, а не
новое продуктовое решение; принцип минимума запрещает заранее объединить обе поверхности.
