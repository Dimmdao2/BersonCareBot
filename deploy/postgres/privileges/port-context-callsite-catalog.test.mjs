import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

import { declaration } from './declaration.ts';

const PRODUCTION_SOURCE_ROOTS = [
  ['integrator', 'apps/integrator/src'],
  ['webapp', 'apps/webapp/src'],
];
const EXCLUDED_DIRECTORIES = new Set(['.next', 'coverage', 'dist', 'generated', '__generated__', 'node_modules']);
const TEST_FILE_RE = /(?:^|\.)(?:test|spec|unit|integration|e2e)\.[cm]?[jt]sx?$/;

const patientRoot = (purpose, argCount, source) => ({
  port: 'webapp', targetRole: 'app_patient', contextClass: 'patient', purpose, argCount, source,
});

const EXPECTED_ROOTS = new Map(Object.entries({
  'app.read_patient_reminder_materialization_snapshot(uuid,timestamp with time zone)': {
    port: 'webapp', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'reminder.materialization.snapshot.read', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgPatientReminderMaterialization.ts',
  },
  'app.read_patient_reminder_delivery_target_snapshot(uuid,uuid,bigint,text,timestamp with time zone)': {
    port: 'webapp', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'reminder.materialization.targets.read', argCount: 5,
    source: 'apps/webapp/src/infra/repos/pgPatientReminderMaterialization.ts',
  },
  'app.commit_patient_reminder_materialization(uuid,text,text,uuid,text,timestamp with time zone,integer,text)': {
    port: 'webapp', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'reminder.materialization.commit', argCount: 8,
    source: 'apps/webapp/src/infra/repos/pgPatientReminderMaterialization.ts',
  },
  'app.read_integrator_delivery_target_snapshot(uuid,text,text,text,uuid,bigint,text,timestamp with time zone)': {
    port: 'webapp', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'integrator.delivery-targets.read', argCount: 8,
    source: 'apps/webapp/src/infra/repos/pgIntegratorDeliveryTargets.ts',
  },
  'app.read_admin_notification_targets(text)': {
    port: 'webapp', argCount: 1, descriptorCount: 2,
    descriptors: [
      { targetRole: 'app_pre_session', contextClass: 'pre_session',
        purpose: 'notifications.admin-targets.read' },
      { targetRole: 'app_worker', contextClass: 'service',
        purpose: 'notifications.admin-targets.read' },
    ],
    source: 'apps/webapp/src/infra/repos/pgAdminNotificationTargets.ts',
  },
  'app.password_login_acquire(text,text,uuid,text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.password.acquire', argCount: 4,
    source: 'apps/webapp/src/infra/repos/pgPasswordLoginProtection.ts',
  },
  'app.auth_channel_binding_session(text,text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.channel-binding.session', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgIdentityResolution.ts',
  },
  'app.read_current_patient_active_organizations()': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'patient.organization.resolve', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgPatientOrganization.ts',
  },
  'app.read_current_patient_material_rating_snapshot(text,uuid)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'patient.material-rating.snapshot.read', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgMaterialRating.ts',
  },
  'app.read_current_patient_treatment_program_description(uuid)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'patient.program.description.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgPatientOrganization.ts',
  },
  'app.create_patient_program_submission_media(uuid,text,text,text,bigint)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'patient.media.program-submission.create', argCount: 5,
    source: 'apps/webapp/src/infra/repos/s3MediaStorage.ts',
  },
  'app.confirm_patient_program_submission_media(uuid)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'patient.media.program-submission.confirm', argCount: 1,
    source: 'apps/webapp/src/infra/repos/s3MediaStorage.ts',
  },
  'app.abort_patient_program_submission_media(uuid)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'patient.media.program-submission.abort', argCount: 1,
    source: 'apps/webapp/src/infra/repos/s3MediaStorage.ts',
  },
  'app.enqueue_media_transcode_job_for_staff(uuid)': {
    port: 'webapp', targetRole: 'app_staff', contextClass: 'staff',
    purpose: 'media.transcode.enqueue', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgMediaTranscodeJobs.ts',
  },
  // Один корень на все исходящие сообщения. Два дескриптора — потому что классов контекста два
  // (пациент и staff), а дверь одна: вид сообщения — это `purpose` в аргументах, а не своя функция.
  // Шестой аргумент — `text`, не `jsonb` (миграция 0036): jsonb в сигнатуре порт-аргумента
  // невоспроизводим байт в байт клиентом и ронял КАЖДЫЙ вызов раньше похода в базу.
  'app.enqueue_outbound_message(uuid,text,text,text,text,text,integer)': {
    port: 'webapp', argCount: 7, descriptorCount: 2,
    descriptors: [
      { targetRole: 'app_patient', contextClass: 'patient',
        purpose: 'outbound.message.enqueue' },
      { targetRole: 'app_staff', contextClass: 'staff',
        purpose: 'outbound.message.enqueue' },
    ],
    source: 'apps/webapp/src/infra/repos/pgOutboundMessageQueue.ts',
  },
  // Единственный корень замены поколения напоминаний о записи (миграция 0034). До него вебапп писал
  // очередь напрямую, а INSERT на неё не выдан ни одной рабочей роли — строк не появлялось вовсе.
  'app.replace_appointment_reminder_generation(uuid,uuid,timestamp with time zone,text,text)': {
    port: 'webapp', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'reminder.appointment-generation.replace', argCount: 5,
    source: 'apps/webapp/src/infra/repos/pgAppointmentReminderMaterialization.ts',
  },
  // Два корня контактов формы записи (миграция 0037). До них вебапп под пациентом звал ВРАЧЕБНЫЙ
  // порт к `platform_users`, получал 42501 на каждой записи, и пустой перехват съедал отказ —
  // телефон и почта из формы не сохранялись ни у кого.
  'app.read_current_patient_identity_contacts()': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-identity-contacts.read', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgPlatformUserContacts.ts',
  },
  'app.record_current_patient_booking_contact(text,text,text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-contact.record', argCount: 3,
    source: 'apps/webapp/src/infra/repos/pgPlatformUserContacts.ts',
  },
  'app.enqueue_media_transcode_job_for_service(uuid)': {
    port: 'webapp', targetRole: 'app_operational_media_worker', contextClass: 'service',
    purpose: 'media.transcode.enqueue', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgMediaTranscodeJobs.ts',
  },
  'app.resolve_staff_workspace_memberships(uuid)': {
    port: 'webapp', argCount: 1, descriptorCount: 2,
    descriptors: [
      { targetRole: 'app_pre_session', contextClass: 'pre_session',
        purpose: 'auth.staff-workspace.resolve' },
      { targetRole: 'app_staff', contextClass: 'staff',
        purpose: 'auth.staff-workspace.resolve' },
    ],
    source: 'apps/webapp/src/infra/repos/pgOrganizationMembership.ts',
  },
  'app.password_login_complete(uuid,boolean)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.password.complete', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgPasswordLoginProtection.ts',
  },
  'app.password_login_read_altcha_secret()': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.password.altcha-secret', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgPasswordLoginProtection.ts',
  },
  'app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.password.altcha-issue', argCount: 4,
    source: 'apps/webapp/src/infra/repos/pgPasswordLoginProtection.ts',
  },
  'app.auth_login_token_create(text,uuid,text,timestamp with time zone)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.login-token.create', argCount: 4,
    source: 'apps/webapp/src/infra/repos/pgLoginTokens.ts',
  },
  'app.auth_login_token_read(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.login-token.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgLoginTokens.ts',
  },
  'app.auth_login_token_expire_past()': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.login-token.expire', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgLoginTokens.ts',
  },
  'app.auth_login_token_confirm(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.login-token.confirm', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgLoginTokens.ts',
  },
  'app.auth_login_token_mark_session_issued(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.login-token.session-issued', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgLoginTokens.ts',
  },
  'app.auth_oauth_find_user(text,text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.oauth.callback.find-binding', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgOAuthBindings.ts',
  },
  'app.auth_oauth_upsert_binding(uuid,text,text,text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.oauth.callback.upsert-binding', argCount: 4,
    source: 'apps/webapp/src/infra/repos/pgOAuthUserResolve.ts',
  },
  'app.auth_rate_limit_check_and_record(text,text,integer,integer,text,integer,integer)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.rate-limit.check-record', argCount: 7,
    source: 'apps/webapp/src/infra/repos/pgAuthRateLimitEvents.ts',
  },
  'app.email_auth_find_email_otp_lock(uuid)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.email-otp.lock.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgEmailAuth.ts',
  },
  'app.email_auth_register_email_otp_lockout(uuid)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.email-otp.lock.register', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgEmailAuth.ts',
  },
  'app.email_auth_reset_email_otp_lockout(uuid)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.email-otp.lock.reset', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgEmailAuth.ts',
  },
  'app.email_auth_start_challenge(uuid,text,text,bigint,text,text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.email-otp.challenge.start', argCount: 6,
    source: 'apps/webapp/src/infra/repos/pgEmailAuth.ts',
  },
  'app.email_password_find_reset_candidate(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.password.reset-candidate', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgUserPasswordCredentials.ts',
  },
  'app.email_otp_public_find_or_create_user(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.email-otp.user.find-or-create', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgEmailOtpPublic.ts',
  },
  'app.email_otp_public_find_user_by_email(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.email-otp.user.find', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgEmailOtpPublic.ts',
  },
  'app.email_otp_public_register_patient(text,text,text,text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.email-otp.registration.create', argCount: 4,
    source: 'apps/webapp/src/infra/repos/pgEmailOtpPublic.ts',
  },
  'app.email_otp_public_consume_latest_challenge(text,text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.email-otp.challenge.consume', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgEmailOtpPublic.ts',
  },
  'app.email_otp_public_find_email_send_cooldown_by_email(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.email-otp.cooldown.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgEmailOtpPublic.ts',
  },
  'app.phone_auth_find_latest_challenge_created_at(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.phone-otp.cooldown.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgPhoneOtpLimits.ts',
  },
  'app.phone_auth_find_otp_lock(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.phone-otp.lock.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgPhoneOtpLimits.ts',
  },
  'app.phone_messenger_bind_secret(text,text,uuid,text,text,text,uuid,text,text,timestamp with time zone)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.phone-messenger-bind.secret', argCount: 10,
    source: 'apps/webapp/src/infra/repos/pgPhoneMessengerBind.ts',
  },
  'app.phone_messenger_bind_completion_state(text,text,text,text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.phone-messenger-bind.completion-state', argCount: 4,
    source: 'apps/webapp/src/infra/repos/pgPhoneMessengerBind.ts',
  },
  // Замер 19.08 живым запросом под сессией глобального админа: страница отдавала HTTP 500, а в
  // журнале Postgres 42501 на СЕМНАДЦАТИ из девятнадцати читаемых таблиц. Тридцать операторов
  // отношением сведены в один снимок за одной дверью (миграция 0043).
  'app.read_platform_analytics_dashboard(timestamp with time zone,timestamp with time zone,text,text)': {
    port: 'webapp', targetRole: 'app_platform_settings', contextClass: 'platform',
    purpose: 'analytics.platform-dashboard.read', argCount: 4,
    source: 'apps/webapp/src/infra/repos/pgPlatformAnalytics.ts',
  },
  'app.list_platform_registration_analytics_events(timestamp with time zone,timestamp with time zone,text,text,text,integer,integer)': {
    port: 'webapp', targetRole: 'app_platform_settings', contextClass: 'platform',
    purpose: 'analytics.registration-events.read', argCount: 7,
    source: 'apps/webapp/src/infra/repos/pgProductAnalytics.ts',
  },
  'app.phone_auth_register_otp_lockout(text,bigint)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.phone-otp.lock.register', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgPhoneOtpLimits.ts',
  },
  'app.phone_auth_reset_otp_lockout(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.phone-otp.lock.reset', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgPhoneOtpLimits.ts',
  },
  'app.phone_challenge_store_upsert(text,text,bigint,text,text,integer)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.phone-challenge.upsert', argCount: 6,
    source: 'apps/webapp/src/infra/repos/pgPhoneChallengeStore.ts',
  },
  'app.phone_challenge_store_read(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.phone-challenge.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgPhoneChallengeStore.ts',
  },
  'app.phone_challenge_store_delete(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.phone-challenge.delete', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgPhoneChallengeStore.ts',
  },
  'app.phone_challenge_store_delete_by_phone(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.phone-challenge.delete-by-phone', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgPhoneChallengeStore.ts',
  },
  'app.phone_challenge_store_increment_attempts(text,bigint)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.phone-challenge.attempt.increment', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgPhoneChallengeStore.ts',
  },
  'app.phone_otp_public_booking_issue_challenge(text,text,text,integer,integer,text,text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'booking.public-phone-otp.issue', argCount: 7,
    source: 'apps/webapp/src/infra/repos/pgPublicBookingOtp.ts',
  },
  'app.phone_otp_public_booking_consume_challenge(text,text,integer,integer)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'booking.public-phone-otp.consume', argCount: 4,
    source: 'apps/webapp/src/infra/repos/pgPublicBookingOtp.ts',
  },
  'app.resolve_public_booking_client_by_phone(text,text,boolean)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'booking.public-client.resolve', argCount: 3,
    source: 'apps/webapp/src/infra/repos/pgPublicBookingUserResolve.ts',
  },
  'app.enroll_current_patient_in_public_booking_clinic(uuid,text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.public-client.enroll', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgPublicBookingUserResolve.ts',
  },
  'app.revoke_public_booking_enrollment(uuid)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.public-client.revoke', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgPublicBookingUserResolve.ts',
  },
  'app.read_public_runtime_setting(text,text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'config.runtime.public.read', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgAppRuntimeSettings.ts',
  },
  'app.read_webapp_server_runtime_setting(text,text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'config.runtime.server.read', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgAppRuntimeSettings.ts',
  },
  'app.is_smtp_outbound_configured()': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.channel.smtp.configured', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgSystemSettings.ts',
  },
  'app.is_sms_provider_configured()': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.channel.sms.configured', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgSystemSettings.ts',
  },
  'app.is_telegram_login_configured()': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.channel.telegram.configured', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgSystemSettings.ts',
  },
  'app.is_max_bot_configured()': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.channel.max.configured', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgSystemSettings.ts',
  },
  'app.passkey_issue_challenge(uuid,text,uuid,text,text,text,timestamp with time zone)': {
    port: 'webapp', argCount: 7, descriptorCount: 2,
    descriptors: [
      { targetRole: 'app_pre_session', contextClass: 'pre_session',
        purpose: 'auth.passkey.challenge.issue' },
      { targetRole: 'app_patient', contextClass: 'patient',
        purpose: 'auth.passkey.registration-challenge.issue' },
    ],
    source: 'apps/webapp/src/infra/repos/pgPasskeyStore.ts',
  },
  'app.passkey_read_challenge(uuid,text)': {
    port: 'webapp', argCount: 2, descriptorCount: 2,
    descriptors: [
      { targetRole: 'app_pre_session', contextClass: 'pre_session',
        purpose: 'auth.passkey.challenge.read' },
      { targetRole: 'app_patient', contextClass: 'patient',
        purpose: 'auth.passkey.registration-challenge.read' },
    ],
    source: 'apps/webapp/src/infra/repos/pgPasskeyStore.ts',
  },
  'app.passkey_read_credential(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.passkey.credential.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgPasskeyStore.ts',
  },
  'app.passkey_complete_authentication(uuid,text,bigint,bigint,text,boolean)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.passkey.authentication.complete', argCount: 6,
    source: 'apps/webapp/src/infra/repos/pgPasskeyStore.ts',
  },
  'app.get_public_reference_baseline(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'catalog.public-reference.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgReferences.ts',
  },
  'app.is_organization_slug_available(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.specialist-signup.slug-availability', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgClinicDirectory.ts',
  },
  'app.read_webapp_preauth_provider_setting(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'config.preauth-provider.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgSystemSettings.ts',
  },
  // Публичная визитка клиники `/{clinic}` (владелец 19.08): чтение под bootstrap-ролью, запись
  // владельцем клиники. Миграция 0049.
  'app.read_public_clinic_card(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'clinic.public-card.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgClinicPublicCard.ts',
  },
  'app.save_public_clinic_card(uuid,text,text,text,text,uuid,text,boolean)': {
    port: 'webapp', targetRole: 'app_staff', contextClass: 'staff',
    purpose: 'clinic.public-card.save', argCount: 8,
    source: 'apps/webapp/src/infra/repos/pgClinicPublicCard.ts',
  },
  'app.resolve_public_organization_by_slug(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'booking.public-organization.resolve', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgClinicDirectory.ts',
  },
  // Замер 19.08: `GET /book/<слаг>` неделю отвечал «Каталог недоступен» (и 503 на шагах слотов и
  // формы) в КАЖДОЙ опубликованной клинике. Организационный принципал вебаппа проецируется на класс
  // `tenant_service`, а обычное реляционное чтение берёт возможность с `purpose: 'relation'` — у
  // порта `webapp` такой у арендаторского класса нет и по SCHEME §3 быть не должно. Дверей у
  // публичной записи не было ни одной: это не деградация части, а ноль. Четыре корня — миграция 0043.
  'app.resolve_public_booking_organization(uuid,uuid)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'booking.public-tenant.resolve', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgBookingScheduling.ts',
  },
  'app.read_public_booking_catalog(uuid,uuid)': {
    port: 'webapp', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'booking.public-catalog.read', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgBookingEngine.ts',
  },
  'app.read_public_booking_slot_snapshot(uuid,uuid,text,text)': {
    port: 'webapp', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'booking.public-slot-snapshot.read', argCount: 4,
    source: 'apps/webapp/src/infra/repos/pgBookingScheduling.ts',
  },
  'app.list_public_booking_form_fields()': {
    port: 'webapp', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'booking.public-form-fields.read', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgBookingForm.ts',
  },
  'app.resolve_public_organization_slug(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'booking.public-slug.resolve', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgClinicDirectory.ts',
  },
  'app.get_web_push_vapid_public_key()': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'patient.web-push.vapid-public-key.read', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgSystemSettings.ts',
  },
  'app.resolve_saas_billing_invoice_for_webhook(text,text)': {
    port: 'webapp', targetRole: 'app_worker', contextClass: 'service',
    purpose: 'billing.webhook.invoice.resolve', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgSaasBilling.ts',
  },
  'app.resolve_saas_billing_refund_for_webhook(text,text)': {
    port: 'webapp', targetRole: 'app_worker', contextClass: 'service',
    purpose: 'billing.webhook.refund.resolve', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgSaasBilling.ts',
  },
  'app.list_saas_billing_period_catalog()': {
    port: 'webapp', targetRole: 'app_clinic_billing', contextClass: 'staff',
    purpose: 'billing.clinic.period-catalog.read', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgSaasBilling.ts',
  },
  'app.list_saas_billing_period_catalog_platform()': {
    port: 'webapp', targetRole: 'app_platform_settings', contextClass: 'platform',
    purpose: 'billing.platform.period-catalog.read', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgSaasBilling.ts',
  },
  'app.resolve_patient_acquiring_webhook_organization(text,text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'patient-payment.webhook.resolve', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgPatientPayments.ts',
  },
  'app.read_saas_billing_payment_provider_preauth()': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'billing.webhook.provider.read', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgSystemSettings.ts',
  },
  'app.read_saas_billing_payment_provider_clinic()': {
    port: 'webapp', targetRole: 'app_clinic_billing', contextClass: 'staff',
    purpose: 'billing.clinic.provider.read', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgSystemSettings.ts',
  },
  'app.read_saas_billing_payment_provider_platform()': {
    port: 'webapp', targetRole: 'app_platform_settings', contextClass: 'platform',
    purpose: 'billing.platform.provider.read', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgSystemSettings.ts',
  },
  'app.list_integration_webhook_burst_signals(integer,integer)': {
    port: 'webapp', targetRole: 'app_worker', contextClass: 'service',
    purpose: 'health.webhook-errors.aggregate', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgOperatorHealthRead.ts',
  },
  'app.prune_integration_webhook_error_events(integer)': {
    port: 'webapp', targetRole: 'app_worker', contextClass: 'service',
    purpose: 'health.webhook-errors.prune', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgOperatorHealthWrite.ts',
  },
  // Замер 19.08: тик суточной сводки читал `public.outgoing_delivery_queue` отношением под
  // `app_staff`, получал 42501 на первом же шаге и падал целиком — сводка не уходила ни разу
  // (миграция 0038).
  'app.read_operator_health_digest_last_sent_at()': {
    port: 'webapp', targetRole: 'app_worker', contextClass: 'service',
    purpose: 'health.digest.last-sent.read', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgOperatorHealthDigestDeliveries.ts',
  },
  // Замер 19.08: снимок здоровья очереди шёл двенадцатью запросами отношением под `app_staff` и
  // ронял ВЕСЬ пятиминутный критический тик (голый `Promise.all`), а не одну панель (миграция 0039).
  'app.read_operator_delivery_queue_health()': {
    port: 'webapp', targetRole: 'app_worker', contextClass: 'service',
    purpose: 'health.delivery-queue.aggregate', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgOperatorHealthRead.ts',
  },
  // Замер 19.08: строк `kind='operator_health_digest'` в очереди НОЛЬ за всю историю — постановка
  // шла прямым INSERT под `app_staff`, у которого на очереди нет ни одной привилегии (0039).
  'app.enqueue_operator_health_digest_delivery(text,text,text,integer)': {
    port: 'webapp', targetRole: 'app_worker', contextClass: 'service',
    purpose: 'health.digest.enqueue', argCount: 4,
    source: 'apps/webapp/src/infra/repos/pgOperatorHealthDigestDeliveries.ts',
  },
  // Замер 19.08: аудитория staff-веб-пуша операторского алерта читалась отношением под
  // `app_worker` и отбивалась `42501 permission denied for table be_organization_members`; отказ
  // гасился `.catch` диспетчера, а тик писал `success` (миграция 0040).
  'app.list_operator_alert_staff_push_recipients()': {
    port: 'webapp', targetRole: 'app_worker', contextClass: 'service',
    purpose: 'notifications.staff-push-audience.read', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgStaffUsers.ts',
  },
  // Замер 19.08: часовой тик продления заявлял класс `platform` с выдуманным нулевым UUID вместо
  // администратора и падал на установке контекста — строки `billing.saas_renewal.tick` не было
  // ни разу. Межарендное перечисление получило свою дверь (миграция 0040).
  'app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)': {
    port: 'webapp', targetRole: 'app_worker', contextClass: 'service',
    purpose: 'billing.saas-renewal.due-list', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgSaasBilling.ts',
  },
  // Замер 19.08 на TEST: сторож читал инциденты и не мог открыть ни одного — прямой INSERT под
  // `app_worker` отбивался `42501 permission denied for table operator_incidents` каждые пять
  // минут, и тик падал целиком именно тогда, когда что-то заметил (миграция 0041).
  'app.open_or_touch_operator_critical_incident(text,text,text,timestamp with time zone,text)': {
    port: 'webapp', targetRole: 'app_worker', contextClass: 'service',
    purpose: 'health.critical-incident.open-or-touch', argCount: 5,
    source: 'apps/webapp/src/infra/repos/pgOperatorHealthWrite.ts',
  },
  'app.prune_operator_health_failure_archive(integer)': {
    port: 'webapp', targetRole: 'app_worker', contextClass: 'service',
    purpose: 'health.failure-archive.prune', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgHealthFailureArchive.ts',
  },
  // Один корень уборки по сроку хранения на четыре запертые арендаторские таблицы; цель
  // приходит меткой из закрытого списка, а не именем таблицы. Один callsite на все тики —
  // тики сохраняют свою личность, общая у них только эта дверь.
  'app.prune_retention_target(text,integer,boolean)': {
    port: 'webapp', targetRole: 'app_operational_maintenance', contextClass: 'service',
    purpose: 'retention.locked-tenant-table.sweep', argCount: 3,
    source: 'apps/webapp/src/infra/db/pruneRetentionTarget.ts',
  },
  'app.resolve_outgoing_delivery_scope(uuid)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.resolve-scope', argCount: 1,
    source: 'apps/integrator/src/infra/db/repos/outgoingDeliveryScope.ts',
  },
  'app.operator_incident_alert_already_sent(uuid)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.incident-alert-status', argCount: 1,
    source: 'apps/integrator/src/infra/db/repos/outgoingDeliveryScope.ts',
  },
  'app.mark_operator_incident_alert_sent(uuid)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.incident-alert-mark', argCount: 1,
    source: 'apps/integrator/src/infra/db/repos/outgoingDeliveryScope.ts',
  },
  'app.list_scheduler_reminder_organization_ids()': {
    port: 'integrator', targetRole: 'app_operational_scheduler', contextClass: 'service',
    purpose: 'scheduler.reminder-organizations', argCount: 0,
    source: 'apps/integrator/src/infra/db/repos/schedulerReminderOrganizations.ts',
  },
  'app.revalidate_appointment_reminder_materialization(uuid)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.appointment-reminder-revalidate', argCount: 1,
    source: 'apps/integrator/src/infra/db/repos/appointmentReminderDelivery.ts',
  },
  'app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.appointment-reminder-advance', argCount: 3,
    source: 'apps/integrator/src/infra/db/repos/appointmentReminderDelivery.ts',
  },
  'app.read_integrator_migration_ledger()': {
    port: 'integrator', targetRole: 'app_service', contextClass: 'service',
    purpose: 'migration.ledger.read', argCount: 0,
    source: 'apps/integrator/src/infra/db/migrate.ts',
  },
  'app.read_integrator_projection_health(integer)': {
    port: 'integrator', targetRole: 'app_service', contextClass: 'service',
    purpose: 'integrator.projection-health.read', argCount: 1,
    source: 'apps/integrator/src/infra/db/repos/projectionHealth.ts',
  },
  'app.read_integrator_provider_runtime_setting(text)': {
    port: 'integrator', targetRole: 'app_service', contextClass: 'service',
    purpose: 'config.integrator-provider.read', argCount: 1,
    source: 'apps/integrator/src/infra/db/publicSystemSettings.ts',
  },
  'app.read_integrator_runtime_setting(text)': {
    port: 'integrator', targetRole: 'app_service', contextClass: 'service',
    purpose: 'config.integrator-runtime.read', argCount: 1,
    source: 'apps/integrator/src/infra/db/publicSystemSettings.ts',
  },
  'app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.attempt-audit', argCount: 10,
    source: 'apps/integrator/src/infra/db/repos/messageLogs.ts',
  },
  'app.enqueue_integrator_inbound_reply(text,text,text,integer,uuid)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.inbound-reply.enqueue', argCount: 5,
    source: 'apps/integrator/src/infra/db/repos/outgoingDeliveryQueue.ts',
  },
  'app.record_integrator_webhook_outcome(text,boolean,integer,text,text)': {
    port: 'integrator', targetRole: 'app_service', contextClass: 'service',
    purpose: 'integrator.webhook-outcome.record', argCount: 5,
    source: 'apps/integrator/src/infra/db/repos/integrationWebhookStatusDrizzle.ts',
  },
  'app.resolve_clinic_dedicated_bot_organization(text,text)': {
    port: 'integrator', targetRole: 'app_integrator_resolver', contextClass: 'integrator',
    purpose: 'integrator.dedicated-bot.resolve', argCount: 2,
    source: 'apps/integrator/src/infra/db/clinicDedicatedBotBindings.ts',
  },
  'app.resolve_active_organization_for_integrator_user_id(bigint)': {
    port: 'integrator', targetRole: 'app_integrator_resolver', contextClass: 'integrator',
    purpose: 'integrator.user-organization.resolve', argCount: 1,
    source: 'apps/integrator/src/infra/db/repos/channelUsers.ts',
  },
  'app.integrator_upsert_channel_identity(text,text,text)': {
    port: 'integrator', targetRole: 'app_integrator_resolver', contextClass: 'integrator',
    purpose: 'integrator.channel-identity.upsert', argCount: 3,
    source: 'apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts',
  },
  'app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)': {
    port: 'integrator', targetRole: 'app_integrator_resolver', contextClass: 'integrator',
    purpose: 'integrator.bootstrap-phone-bind', argCount: 4,
    source: 'apps/integrator/src/infra/db/directPublic/bootstrapMessengerPhoneBind.ts',
  },
  'app.read_integrator_auth_channel_setting(text)': {
    port: 'integrator', targetRole: 'app_service', contextClass: 'service',
    purpose: 'config.integrator-auth-channel.read', argCount: 1,
    source: 'apps/integrator/src/infra/db/authChannelPolicy.ts',
  },
  'app.read_integrator_smtp_outbound_setting()': {
    port: 'integrator', targetRole: 'app_service', contextClass: 'service',
    purpose: 'config.integrator-smtp.read', argCount: 0,
    source: 'apps/integrator/src/infra/db/publicRestrictedSettings.ts',
  },
  'app.upsert_integration_data_quality_incident(text,text,text,text,text,text,text)': {
    port: 'integrator', targetRole: 'app_service', contextClass: 'service',
    purpose: 'integrator.data-quality.upsert', argCount: 7,
    source: 'apps/integrator/src/infra/db/repos/integrationDataQualityIncidents.ts',
  },
  'app.try_acquire_integrator_idempotency(text,integer)': {
    port: 'integrator', targetRole: 'app_service', contextClass: 'service',
    purpose: 'integrator.idempotency.acquire', argCount: 2,
    source: 'apps/integrator/src/infra/db/repos/idempotencyKeys.ts',
  },
  'app.release_integrator_idempotency(text)': {
    port: 'integrator', targetRole: 'app_service', contextClass: 'service',
    purpose: 'integrator.idempotency.release', argCount: 1,
    source: 'apps/integrator/src/infra/db/repos/idempotencyKeys.ts',
  },
  'app.append_platform_audit_event(text,text,text)': {
    port: 'webapp', argCount: 3, descriptorCount: 2,
    descriptors: [
      { targetRole: 'app_platform_admin', contextClass: 'platform',
        purpose: 'platform.audit-event.append' },
      { targetRole: 'app_pre_session', contextClass: 'pre_session',
        purpose: 'platform.audit-event.append' },
    ],
    source: 'apps/webapp/src/infra/adminAuditLog.ts',
  },
  'app.resolve_platform_audit_conflict(uuid)': {
    port: 'webapp', targetRole: 'app_platform_admin', contextClass: 'platform',
    purpose: 'platform.audit-conflict.resolve', argCount: 1,
    source: 'apps/webapp/src/infra/adminAuditLog.ts',
  },
  'app.acknowledge_open_outbound_provider_incidents()': {
    port: 'webapp', targetRole: 'app_platform_admin', contextClass: 'platform',
    purpose: 'platform.operator-incidents.acknowledge', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgOperatorHealthWrite.ts',
  },
  'app.resolve_all_open_operator_incidents()': {
    port: 'webapp', targetRole: 'app_platform_admin', contextClass: 'platform',
    purpose: 'platform.operator-incidents.resolve', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgOperatorHealthWrite.ts',
  },
  'app.list_platform_health_failure_archive(text,integer,timestamp with time zone,uuid)': {
    port: 'webapp', targetRole: 'app_platform_admin', contextClass: 'platform',
    purpose: 'platform.health-archive.list', argCount: 4,
    source: 'apps/webapp/src/infra/repos/pgHealthFailureArchive.ts',
  },
  'app.archive_operator_health_failures(text,integer,uuid)': {
    port: 'webapp', targetRole: 'app_platform_admin', contextClass: 'platform',
    purpose: 'platform.health-archive.clear', argCount: 3,
    source: 'apps/webapp/src/infra/repos/pgHealthFailureArchive.ts',
  },
  'app.integrator_event_idempotency_read(text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'integrator.event-idempotency.read', argCount: 1,
    source: 'apps/webapp/src/infra/idempotency/pgStore.ts',
  },
  'app.integrator_event_idempotency_store(text,text,integer,text,integer)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'integrator.event-idempotency.store', argCount: 5,
    source: 'apps/webapp/src/infra/idempotency/pgStore.ts',
  },
  'app.record_reminder_occurrence_finalized_projection(text,text,bigint,uuid,uuid,text,text,text,text,timestamp with time zone)': {
    port: 'webapp', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'integrator.reminder-occurrence-finalized.record', argCount: 10,
    source: 'apps/webapp/src/infra/repos/pgReminderProjection.ts',
  },
  'app.read_patient_telegram_display_handle(uuid)': {
    port: 'webapp', targetRole: 'app_staff', contextClass: 'staff',
    purpose: 'messaging.patient-telegram-handle.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgPatientTelegramUsernameMention.ts',
  },
  'app.read_canonical_appointment_by_external_id(text)': {
    port: 'webapp', targetRole: 'app_worker', contextClass: 'service',
    purpose: 'booking.integrator-record.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgCanonicalAppointments.ts',
  },
  'app.list_active_canonical_appointments_by_phone(text)': {
    port: 'webapp', targetRole: 'app_worker', contextClass: 'service',
    purpose: 'booking.integrator-active.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgCanonicalAppointments.ts',
  },
  'app.count_active_canonical_appointments()': {
    port: 'integrator', targetRole: 'app_service', contextClass: 'service',
    purpose: 'booking.admin-active.count', argCount: 0,
    source: 'apps/integrator/src/infra/db/repos/adminStats.ts',
  },
  'app.get_google_calendar_event_id(uuid)': {
    port: 'integrator', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'calendar.map.get', argCount: 1,
    source: 'apps/integrator/src/infra/db/repos/bookingCalendarMap.ts',
  },
  'app.upsert_google_calendar_event_id(uuid,text)': {
    port: 'integrator', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'calendar.map.upsert', argCount: 2,
    source: 'apps/integrator/src/infra/db/repos/bookingCalendarMap.ts',
  },
  'app.delete_google_calendar_event_id(uuid)': {
    port: 'integrator', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'calendar.map.delete', argCount: 1,
    source: 'apps/integrator/src/infra/db/repos/bookingCalendarMap.ts',
  },
  'app.read_booking_calendar_patient_profile(uuid)': {
    port: 'integrator', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'calendar.patient-profile.read', argCount: 1,
    source: 'apps/integrator/src/integrations/google-calendar/calendarDescription.ts',
  },
  'app.read_booking_calendar_latest_staff_comment(uuid)': {
    port: 'integrator', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'calendar.staff-comment.read', argCount: 1,
    source: 'apps/integrator/src/integrations/google-calendar/calendarDescription.ts',
  },
  'app.is_current_patient_self_booking_allowed()': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.self.allowed', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgClientHistory.ts',
  },
  'app.read_current_patient_booking_runtime_integer(text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-runtime-integer.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgBookingScheduling.ts',
  },
  'app.read_current_patient_booking_creation_snapshot(uuid,uuid,text,text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-creation-snapshot.read', argCount: 4,
    source: 'apps/webapp/src/infra/repos/pgBookingScheduling.ts',
  },
  'app.read_current_patient_booking_payment_setting(text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-payment-config.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgSystemSettings.ts',
  },
  'app.read_current_patient_booking_prepayment_policy(uuid,text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-prepayment-policy.read', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgPayments.ts',
  },
  'app.read_current_patient_booking_busy_intervals(uuid,uuid,timestamp with time zone,timestamp with time zone,uuid)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-busy-intervals.read', argCount: 5,
    source: 'apps/webapp/src/infra/repos/pgBookingScheduling.ts',
  },
  'app.read_current_patient_booking_form_fields()': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-form-fields.read', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgBookingForm.ts',
  },
  'app.save_current_patient_booking_form_answers(uuid,text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-form-answers.save', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgBookingForm.ts',
  },
  'app.read_current_patient_booking_packages(uuid)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-packages.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgMemberships.ts',
  },
  'app.create_current_patient_booking_pending(text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-pending.create', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgPatientBookings.ts',
  },
  'app.mutate_current_patient_booking(uuid,text,text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-row.mutate', argCount: 3,
    source: 'apps/webapp/src/infra/repos/pgPatientBookings.ts',
  },
  'app.create_current_patient_booking_appointments(text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-appointments.create', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgBookingEngine.ts',
  },
  'app.read_current_patient_booking_appointment(uuid)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-appointment.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgBookingEngine.ts',
  },
  'app.set_current_patient_booking_reminder_preset(uuid,text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-reminder-preset.set', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgBookingEngine.ts',
  },
  'app.current_patient_lfk_sessions(text,text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'diary.patient-lfk-sessions', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgLfkDiary.ts',
  },
  'app.read_current_patient_staff_notification_profiles(uuid,text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'notification.current-patient-staff-profiles', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgPatientStaffNotificationProfiles.ts',
  },
  'app.read_integrator_web_push_subscriptions(uuid,uuid)': {
    port: 'webapp', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'integrator.web-push-subscriptions.read', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgIntegratorWebPushDelivery.ts',
  },
  'app.read_integrator_web_push_delivery_settings(uuid)': {
    port: 'webapp', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'integrator.web-push-delivery-settings.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgIntegratorWebPushDelivery.ts',
  },
  'app.record_integrator_support_delivery_attempt(uuid,text,text,text,text,integer,text,text,timestamp with time zone)': {
    port: 'webapp', targetRole: 'app_tenant_service', contextClass: 'tenant_service',
    purpose: 'integrator.support-delivery-attempt.record', argCount: 9,
    source: 'apps/webapp/src/infra/repos/pgIntegratorSupportQuestionOwnership.ts',
  },
  'app.read_current_patient_booking_row(uuid,text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-row.read', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgPatientBookings.ts',
  },
  'app.read_current_patient_booking_policies(text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-policies.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgBookingPolicies.ts',
  },
  'app.read_current_patient_booking_reschedules(uuid)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-reschedules.read', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts',
  },
  'app.apply_current_patient_booking_reschedule(text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-reschedule.apply', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts',
  },
  'app.apply_current_patient_booking_cancellation(text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-cancellation.apply', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts',
  },
  'app.patch_current_patient_booking_notifications(uuid,text,text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-notifications.patch', argCount: 3,
    source: 'apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts',
  },
  'app.reserve_current_patient_booking_package(text)': {
    port: 'webapp', targetRole: 'app_patient', contextClass: 'patient',
    purpose: 'booking.patient-package.reserve', argCount: 1,
    source: 'apps/webapp/src/infra/repos/pgMemberships.ts',
  },
  'app.record_current_patient_practice_completion(uuid,text,integer)': patientRoot(
    'patient.practice-completion.record', 3, 'apps/webapp/src/infra/repos/pgPatientPracticeCompletions.ts'),
  'app.upsert_current_patient_material_rating(text,uuid,integer,uuid,uuid)': patientRoot(
    'patient.material-rating.upsert', 5, 'apps/webapp/src/infra/repos/pgMaterialRating.ts'),
  'app.update_current_patient_practice_completion_feeling(uuid,integer)': patientRoot(
    'patient.practice-completion.feeling.update', 2, 'apps/webapp/src/infra/repos/pgPatientPracticeCompletions.ts'),
  'app.save_current_patient_daily_warmup_presentation(uuid,timestamp with time zone,boolean)': patientRoot(
    'patient.daily-warmup.presentation.save', 3, 'apps/webapp/src/infra/repos/pgPatientDailyWarmupPresentation.ts'),
  'app.record_current_patient_daily_warmup_video_view(uuid)': patientRoot(
    'patient.daily-warmup.video-view.record', 1, 'apps/webapp/src/infra/repos/pgPatientDailyWarmupVideoView.ts'),
  'app.record_current_patient_content_rating_feedback(uuid,integer,text,text)': patientRoot(
    'patient.material-rating.feedback.record', 4, 'apps/webapp/src/infra/repos/pgMaterialRatingFeedback.ts'),
  'app.record_current_patient_playback_client_event(uuid,text,text,text,text)': patientRoot(
    'patient.media.playback-client-event.record', 5, 'apps/webapp/src/app-layer/media/playbackClientEvents.ts'),
  'app.record_current_patient_playback_first_resolve(uuid)': patientRoot(
    'patient.media.playback-first-resolve.record', 1, 'apps/webapp/src/infra/repos/pgPlaybackUserVideoFirstResolve.ts'),
  'app.capture_current_patient_diary_day_snapshot(text,text,integer,integer,boolean,uuid,text,text)': patientRoot(
    'patient.diary-day.snapshot.capture', 8, 'apps/webapp/src/infra/repos/pgPatientDiarySnapshots.ts'),
  'app.set_current_patient_notification_topic(text,boolean)': patientRoot(
    'patient.notification-topic.set', 2, 'apps/webapp/src/infra/repos/pgPatientNotificationTopics.ts'),
  'app.set_current_patient_notification_topic_channel(text,text,boolean)': patientRoot(
    'patient.notification-topic-channel.set', 3, 'apps/webapp/src/infra/repos/pgTopicChannelPrefs.ts'),
  'app.read_current_patient_fio()': patientRoot(
    'patient.identity.self.read', 0, 'apps/webapp/src/infra/repos/pgUserProjection.ts'),
  'app.update_current_patient_fio(text,text,text)': patientRoot(
    'patient.identity.self.update', 3, 'apps/webapp/src/infra/repos/pgUserProjection.ts'),
  'app.create_current_patient_reminder_rule(text,text)': patientRoot(
    'patient.reminder-rule.create', 2, 'apps/webapp/src/infra/repos/pgReminderRules.ts'),
  'app.update_current_patient_reminder_rule(text,text)': patientRoot(
    'patient.reminder-rule.update', 2, 'apps/webapp/src/infra/repos/pgReminderRules.ts'),
  'app.delete_current_patient_reminder_rule(text)': patientRoot(
    'patient.reminder-rule.delete', 1, 'apps/webapp/src/infra/repos/pgReminderRules.ts'),
  'app.record_current_patient_reminder_journal_action(text,text,text,timestamp with time zone,text)': patientRoot(
    'patient.reminder-journal.record', 5, 'apps/webapp/src/infra/repos/pgReminderJournal.ts'),
  'app.mark_current_patient_reminder_history_seen(text)': patientRoot(
    'patient.reminder-history.seen', 1, 'apps/webapp/src/infra/repos/pgReminderProjection.ts'),
  'app.mark_all_current_patient_reminder_history_seen()': patientRoot(
    'patient.reminder-history.seen-all', 0, 'apps/webapp/src/infra/repos/pgReminderProjection.ts'),
  'app.set_current_patient_reminder_muted_until(timestamp with time zone)': patientRoot(
    'patient.reminder.mute', 1, 'apps/webapp/src/infra/repos/pgReminderRules.ts'),
  'app.ensure_current_patient_support_conversation()': patientRoot(
    'patient.support-conversation.ensure', 0, 'apps/webapp/src/infra/repos/pgSupportCommunication.ts'),
  'app.append_current_patient_support_message(uuid,text,text,text,timestamp with time zone,text,text)': patientRoot(
    'patient.support-message.append', 7, 'apps/webapp/src/infra/repos/pgSupportCommunication.ts'),
  'app.mark_current_patient_support_conversation_read(uuid)': patientRoot(
    'patient.support-conversation.read', 1, 'apps/webapp/src/infra/repos/pgSupportCommunication.ts'),
  'app.mark_current_patient_support_messages_read(text)': patientRoot(
    'patient.support-messages.read', 1, 'apps/webapp/src/infra/repos/pgSupportCommunication.ts'),
  'app.mark_current_patient_support_notifications_read()': patientRoot(
    'patient.support-notifications.read', 0, 'apps/webapp/src/infra/repos/pgSupportCommunication.ts'),
  'app.ensure_current_patient_system_symptom_tracking(text,text,uuid)': patientRoot(
    'patient.symptom-system-tracking.ensure', 3, 'apps/webapp/src/infra/repos/pgSymptomDiary.ts'),
  'app.record_current_patient_symptom_entry(uuid,integer,text,timestamp with time zone,text)': patientRoot(
    'patient.symptom-entry.record', 5, 'apps/webapp/src/infra/repos/pgSymptomDiary.ts'),
  'app.update_current_patient_symptom_entry(uuid,integer,text,timestamp with time zone,text)': patientRoot(
    'patient.symptom-entry.update', 5, 'apps/webapp/src/infra/repos/pgSymptomDiary.ts'),
  'app.delete_current_patient_symptom_entry(uuid)': patientRoot(
    'patient.symptom-entry.delete', 1, 'apps/webapp/src/infra/repos/pgSymptomDiary.ts'),
  'app.configure_current_patient_assigned_symptom_tracking(uuid,text,boolean)': patientRoot(
    'patient.symptom-tracking.configure', 3, 'apps/webapp/src/infra/repos/pgSymptomDiary.ts'),
  'app.apply_current_patient_warmup_feeling(uuid,integer,uuid,text,uuid,text)': patientRoot(
    'patient.warmup-feeling.apply', 6, 'apps/webapp/src/infra/repos/pgWarmupFeelingCompletion.ts'),
  'app.save_current_patient_channel_preference(text,boolean,boolean)': patientRoot(
    'patient.channel-preference.save', 3, 'apps/webapp/src/infra/repos/pgChannelPreferences.ts'),
  'app.set_current_patient_preferred_auth_channel(text)': patientRoot(
    'patient.preferred-auth-channel.set', 1, 'apps/webapp/src/infra/repos/pgChannelPreferences.ts'),
  'app.save_current_patient_web_push_subscription(text,text,text,text)': patientRoot(
    'patient.web-push-subscription.save', 4, 'apps/webapp/src/infra/repos/pgWebPushSubscriptions.ts'),
  'app.remove_current_patient_web_push_subscription(text)': patientRoot(
    'patient.web-push-subscription.remove', 1, 'apps/webapp/src/infra/repos/pgWebPushSubscriptions.ts'),
  'app.remove_all_current_patient_web_push_subscriptions()': patientRoot(
    'patient.web-push-subscriptions.remove-all', 0, 'apps/webapp/src/infra/repos/pgWebPushSubscriptions.ts'),
  'app.touch_current_patient_plan_last_opened(uuid)': patientRoot(
    'patient.program.touch', 1, 'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts'),
  'app.touch_current_patient_program_item(uuid,uuid)': patientRoot(
    'patient.program-item.touch', 2, 'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts'),
  'app.complete_current_patient_program_item(uuid,uuid,integer,text)': patientRoot(
    'patient.program-item.complete', 4, 'apps/webapp/src/infra/repos/pgProgramActionLog.ts'),
  'app.enrich_current_patient_program_completion(uuid,uuid,uuid,text)': patientRoot(
    'patient.program-completion.enrich', 4, 'apps/webapp/src/infra/repos/pgProgramActionLog.ts'),
  'app.record_current_patient_program_action(uuid,uuid,text,uuid,text,text)': patientRoot(
    'patient.program-action.record', 6, 'apps/webapp/src/infra/repos/pgProgramActionLog.ts'),
  'app.delete_current_patient_program_actions_in_window(uuid,uuid,timestamp with time zone,timestamp with time zone,boolean)': patientRoot(
    'patient.program-actions.delete-window', 5, 'apps/webapp/src/infra/repos/pgProgramActionLog.ts'),
  'app.append_current_patient_program_event(uuid,text,text,uuid,text,text)': patientRoot(
    'patient.program-event.append', 6, 'apps/webapp/src/infra/repos/pgTreatmentProgramEvents.ts'),
  'app.mark_current_patient_program_item_viewed(uuid,uuid)': patientRoot(
    'patient.program-item.viewed', 2, 'apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts'),
  'app.append_current_patient_program_discussion(uuid,text,uuid)': patientRoot(
    'patient.program-discussion.append', 3, 'apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts'),
  'app.mark_current_patient_program_discussion_read(uuid,timestamp with time zone)': patientRoot(
    'patient.program-discussion.read', 2, 'apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts'),
  'app.ensure_current_patient_test_attempt(uuid)': patientRoot(
    'patient.test-attempt.ensure', 1, 'apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts'),
  'app.start_current_patient_test_attempt(uuid,uuid)': patientRoot(
    'patient.test-attempt.start', 2, 'apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts'),
  'app.save_current_patient_test_result(uuid,uuid,text,text)': patientRoot(
    'patient.test-result.save', 4, 'apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts'),
  'app.submit_current_patient_test_attempt(uuid)': patientRoot(
    'patient.test-attempt.submit', 1, 'apps/webapp/src/infra/repos/pgTreatmentProgramTestAttempts.ts'),
  'app.pre_session_resolve_identity(uuid)': {
    port: 'webapp', contextClass: 'pre_session',
    purpose: 'identity.variant-a.resolve', argCount: 1, descriptorCount: 3,
    sessionRoles: ['app_patient', 'app_platform_settings', 'app_staff'],
    targetRolesBySessionRole: {
      app_patient: 'app_pre_session',
      app_platform_settings: 'app_platform_admin',
      app_staff: 'app_pre_session',
    },
    source: 'apps/webapp/src/infra/db/portContextRuntime.ts',
  },
}));

const EXPECTED_RUNTIME_SOURCES = new Map(Object.entries({
  'integrator:delivery': [
    'delivery-handler',
    'max-webhook:record-outcome',
    'telegram-webhook:record-outcome',
    'worker:job-queue-drain',
    'worker:outgoing-delivery-tick',
    'worker:projection-outbox-tick',
  ],
  'integrator:scheduler': [
    'scheduler:acquire-lock',
    'scheduler:claim-due-jobs',
    'scheduler:handle-tick-event',
  ],
  'integrator:service': ['integrator-health-check'],
  'integrator:migration_ledger': ['integrator-startup-migration-ledger'],
  'webapp:worker': [
    'api/auth/channel-link/start:POST:authenticated',
    'api/integrator/channel-link/complete:POST:verified',
    'api/payments/saas-webhook:POST:verified-resolver',
    'api/payments/saas-webhook:POST:capture',
    'api/integrator/operator-health/digest-wake:POST',
    'api/integrator/system-health/guard-wake:POST',
    'api/internal/operator-health-digest/tick:POST',
    'api/internal/operator-health-critical/tick:POST',
    'api/internal/system-health-guard/tick:POST',
    // 19.08: часовой тик продления подписок переехал сюда с платформенного класса, который
    // требовал живого администратора и поэтому не работал ни разу.
    'api/internal/saas-billing/renewal/tick:POST',
    'api/internal/specialist-task-reminders/tick:POST',
    'api/internal/heartbeat/pipeline_delivery:POST',
    'api/internal/heartbeat/pipeline_delivery:GET',
    'api/internal/heartbeat/digest:POST',
    'api/internal/heartbeat/digest:GET',
    'operator-cron-job-status:write',
    'webapp-health-check',
    'api/health:GET',
  ],
  'webapp:media_worker': [
    'api/internal/media-worker/control:POST',
    'api/internal/media-pending-delete/purge:POST',
    'api/internal/media-multipart/cleanup:POST',
    'api/internal/media-preview/process:POST',
    'api/internal/media-transcode/enqueue:POST',
    'api/internal/media-transcode/reconcile:POST',
  ],
  'webapp:maintenance': [
    'api/internal/media-hls-proxy-errors/retention:POST',
    'api/internal/media-playback-stats/retention:POST',
    'api/internal/product-analytics/retention:POST',
  ],
  'webapp:telemetry': ['webapp-saas-isolation-telemetry'],
}));

function unwrapArrayLiteral(node) {
  let current = node;
  while (ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return ts.isArrayLiteralExpression(current) ? current : null;
}

function resolveExactArgumentTuple(node, callsite) {
  const direct = unwrapArrayLiteral(node);
  if (direct) return direct;
  assert.ok(ts.isIdentifier(node), 'literal named root arguments must be an exact const tuple');

  for (let scope = callsite.parent; scope; scope = scope.parent) {
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
    for (const statement of scope.statements) {
      if (!ts.isVariableStatement(statement)
        || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)
          || declaration.name.text !== node.text
          || !declaration.initializer) continue;
        const tuple = unwrapArrayLiteral(declaration.initializer);
        assert.ok(tuple, `${node.text} must be initialized as an exact const tuple`);
        return tuple;
      }
    }
  }
  assert.fail(`${node.text} must resolve to an exact const tuple in the callsite scope`);
}

function productionSourceFiles(root) {
  const files = [];
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) visit(join(path, entry.name));
        continue;
      }
      if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name) || TEST_FILE_RE.test(entry.name)) continue;
      files.push(join(path, entry.name));
    }
  };
  visit(root);
  return files.sort();
}

function collectNamedRootCallsites() {
  const result = [];
  for (const [port, root] of PRODUCTION_SOURCE_ROOTS) {
    for (const path of productionSourceFiles(root)) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      function visit(node) {
        if (ts.isCallExpression(node)
          && ts.isIdentifier(node.expression)
          && ['runIntegratorNamedRoot', 'runWebappNamedRoot', 'runWebappPreSessionNamedRoot']
            .includes(node.expression.text)) {
          const isPreSession = node.expression.text === 'runWebappPreSessionNamedRoot';
          const identity = node.arguments[isPreSession ? 2 : 1];
          const typedArgs = node.arguments[isPreSession ? 3 : 2];
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          assert.ok(identity, `${path}:${line}: named root identity is required`);
          assert.ok(typedArgs, `${path}:${line}: typed arguments are required`);
          if (ts.isStringLiteralLike(identity)) {
            const exactArgs = resolveExactArgumentTuple(typedArgs, node);
            result.push({ kind: 'literal', port, path, line, identity: identity.text,
              argCount: exactArgs.elements.length });
          } else {
            assert.ok(ts.isIdentifier(identity) && identity.text === 'functionIdentity',
              `${path}:${line}: unexpected dynamic named-root identity`);
            assert.ok(ts.isIdentifier(typedArgs) && typedArgs.text === 'functionArgs',
              `${path}:${line}: unexpected dynamic named-root arguments`);
            result.push({ kind: 'dynamic', port, path, line });
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  return result;
}

function assertCallsiteCatalog(candidate, discovered = collectNamedRootCallsites()) {
  const callsites = discovered.filter((row) => row.kind === 'literal');
  const dynamicWrappers = discovered.filter((row) => row.kind === 'dynamic');
  assert.equal(dynamicWrappers.length, 1, 'one generic named-root readiness wrapper must exist');
  assert.equal(dynamicWrappers[0].port, 'integrator', 'generic named-root wrapper belongs to integrator');
  assert.equal(dynamicWrappers[0].path, 'apps/integrator/src/infra/db/operationalPoolReadiness.ts',
    'generic named-root wrapper moved from the reviewed production source');
  assert.equal(new Set(callsites.map((row) => row.identity)).size, callsites.length,
    'each production named root must have one exact callsite');

  const roots = Object.values(candidate.portContext.capabilities)
    .filter((descriptor) => descriptor.functionIdentity);
  const expectedDescriptorCount = [...EXPECTED_ROOTS.values()]
    .reduce((count, descriptor) => count + (descriptor.descriptorCount ?? 1), 0);
  const byIdentity = Map.groupBy(roots, (descriptor) => descriptor.functionIdentity);

  for (const callsite of callsites) {
    const expected = EXPECTED_ROOTS.get(callsite.identity);
    assert.ok(expected, `${callsite.path}:${callsite.line}: undeclared named-root callsite`);
    assert.equal(callsite.path, expected.source,
      `${callsite.path}:${callsite.line}: named root moved from the reviewed production source`);
    assert.equal(callsite.port, expected.port,
      `${callsite.path}:${callsite.line}: named root moved to the wrong port`);
    assert.equal(callsite.argCount, expected.argCount,
      `${callsite.path}:${callsite.line}: typed argument count does not match function identity`);
    const descriptors = byIdentity.get(callsite.identity);
    assert.equal(
      descriptors?.length,
      expected.descriptorCount ?? 1,
      `${callsite.path}:${callsite.line}: wrong catalog descriptor count`,
    );
    if (expected.descriptors) {
      assert.deepEqual(
        descriptors.map((descriptor) => ({
          targetRole: descriptor.targetRole,
          contextClass: descriptor.contextClass,
          purpose: descriptor.purpose,
        })).sort((left, right) => left.targetRole.localeCompare(right.targetRole)),
        [...expected.descriptors].sort((left, right) => left.targetRole.localeCompare(right.targetRole)),
        `${callsite.path}:${callsite.line}: wrong catalog descriptor partition`,
      );
      continue;
    }
    for (const descriptor of descriptors) {
      const expectedTargetRole = expected.targetRolesBySessionRole?.[descriptor.sessionRole]
        ?? expected.targetRole;
      assert.deepEqual({
        port: descriptor.port,
        targetRole: descriptor.targetRole,
        contextClass: descriptor.contextClass,
        purpose: descriptor.purpose,
      }, {
        port: expected.port,
        targetRole: expectedTargetRole,
        contextClass: expected.contextClass,
        purpose: expected.purpose,
      }, `${callsite.path}:${callsite.line}: wrong catalog descriptor`);
    }
    if (expected.sessionRoles) {
      assert.deepEqual(
        descriptors.map((descriptor) => descriptor.sessionRole).sort(),
        [...expected.sessionRoles].sort(),
        `${callsite.path}:${callsite.line}: wrong physical-login role partition`,
      );
    }
  }
  assert.equal(callsites.length, EXPECTED_ROOTS.size, 'named-root callsite census changed');
  assert.equal(roots.length, expectedDescriptorCount, 'function-bound catalog size changed');
  assert.deepEqual([...byIdentity.keys()].sort(), [...EXPECTED_ROOTS.keys()].sort(),
    'catalog contains a function-bound root without a production callsite');
}

test('production named-root callsites exactly match the independent capability oracle', () => {
  assertCallsiteCatalog(declaration);
});

test('relation descriptors carry the full exact production runtime-source partition', () => {
  const actual = new Map(Object.values(declaration.portContext.capabilities)
    .filter((descriptor) => descriptor.runtimeSources)
    .map((descriptor) => [
      `${descriptor.port}:${descriptor.runtimeName}`,
      [...descriptor.runtimeSources],
    ]));
  assert.deepEqual(actual, EXPECTED_RUNTIME_SOURCES);
});

test('the oracle reds on identity mutation, a missing descriptor, and a wrong descriptor', () => {
  const find = (candidate, identity) => Object.entries(candidate.portContext.capabilities)
    .find(([, descriptor]) => descriptor.functionIdentity === identity);

  const mutatedIdentity = structuredClone(declaration);
  find(mutatedIdentity, 'app.password_login_acquire(text,text,uuid,text)')[1].functionIdentity =
    'app.password_login_complete(uuid,boolean)';
  assert.throws(() => assertCallsiteCatalog(mutatedIdentity));

  const missing = structuredClone(declaration);
  delete missing.portContext.capabilities.password_login_acquire;
  assert.throws(() => assertCallsiteCatalog(missing));

  const wrong = structuredClone(declaration);
  find(wrong, 'app.password_login_acquire(text,text,uuid,text)')[1].targetRole = 'app_staff';
  assert.throws(() => assertCallsiteCatalog(wrong));

  const wrongPort = structuredClone(declaration);
  find(wrongPort, 'app.password_login_acquire(text,text,uuid,text)')[1].port = 'integrator';
  assert.throws(() => assertCallsiteCatalog(wrongPort));
});

test('the oracle reds on added, moved, removed, extra and cross-port production callsites', () => {
  const discovered = collectNamedRootCallsites();
  const firstLiteralIndex = discovered.findIndex((row) => row.kind === 'literal');
  assert.notEqual(firstLiteralIndex, -1);

  assert.throws(() => assertCallsiteCatalog(declaration, [...discovered, discovered[firstLiteralIndex]]));
  assert.throws(() => assertCallsiteCatalog(
    declaration,
    discovered.filter((_, index) => index !== firstLiteralIndex),
  ));

  const moved = structuredClone(discovered);
  moved[firstLiteralIndex].path = 'apps/integrator/src/infra/db/repos/movedRoot.ts';
  assert.throws(() => assertCallsiteCatalog(declaration, moved));

  const crossPort = structuredClone(discovered);
  crossPort[firstLiteralIndex].port = crossPort[firstLiteralIndex].port === 'webapp'
    ? 'integrator'
    : 'webapp';
  assert.throws(() => assertCallsiteCatalog(declaration, crossPort));

  const extra = structuredClone(discovered);
  extra[firstLiteralIndex].identity = 'app.undeclared_extra_root()';
  assert.throws(() => assertCallsiteCatalog(declaration, extra));
});

test('production discovery is path-independent and excludes tests/generated output', () => {
  const files = PRODUCTION_SOURCE_ROOTS.flatMap(([, root]) => productionSourceFiles(root));
  assert.ok(files.length > 10);
  assert.equal(files.some((path) => TEST_FILE_RE.test(path) || path.includes('/generated/')), false);
  const discovered = collectNamedRootCallsites();
  assert.equal(discovered.filter((row) => row.kind === 'literal').length, EXPECTED_ROOTS.size);
  assert.equal(discovered.filter((row) => row.kind === 'dynamic').length, 1);
});
