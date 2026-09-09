/**
 * GET  /api/admin/settings — список настроек scope=admin
 * PATCH /api/admin/settings — обновить ключ scope=admin
 * Guard: branch on the platform.operations capability. Global platform configuration uses
 * the dedicated platform principal and clinic managers keep the organization-scoped path.
 */
import { redactSettingValueForAudit } from '@/modules/system-settings/auditRedaction';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  requireClinicManagementApiContext,
  requirePlatformOperationsApiContext,
  type DoctorWorkspaceAccessContext,
} from '@/app-layer/guards/requireRole';
import {
  hasLaunchCapability,
  resolveLaunchCapabilities,
} from '@/app-layer/guards/workspaceCapabilities';
import {
  entitlementMutationRefusalResponse,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { systemSettingsOrgContextErrorResponse } from '@/app-layer/guards/systemSettingsOrgContextResponse';
import { getCurrentSession } from '@/modules/auth/service';
import type { OrgMechanic } from '@/modules/org-entitlements/types';
import { ALLOWED_KEYS, type SystemSetting } from '@/modules/system-settings/types';
import { isPerOrgSettingKey } from '@/modules/system-settings/orgScopedKeys';
import { OperatorHealthProbeConfigInvalidError } from '@/modules/system-settings/operatorHealthProbeConfig';
import { normalizeNotificationsTopicsForAdminPatch } from '@/modules/patient-notifications/notificationsTopics';
import {
  normalizeModesFormBatchItems,
  normalizeModesFormPatchItem,
  normalizeValueJson,
} from '@/modules/system-settings/adminSettingsPatchNormalize';
import { isModesFormKey, MODES_FORM_KEYS } from '@/modules/system-settings/modesFormKeys';
import {
  VIDEO_PRESIGN_TTL_MAX_SEC,
  VIDEO_PRESIGN_TTL_MIN_SEC,
} from '@/modules/media/videoPresignTtlConstants';
import { coerceAdminBooleanSetting } from '@/modules/system-settings/coerceAdminBooleanSetting';
import { isValidSaasBillingPaymentProviderFiscalSettings } from '@/modules/saas-billing/settings';
import {
  PATIENT_REPEAT_COOLDOWN_MINUTES_MAX,
  PATIENT_REPEAT_COOLDOWN_MINUTES_MIN,
} from '@/modules/patient-home/patientHomeRepeatCooldownSettings';
import {
  isValidPatientHomeDailyWarmupRotationTimesPayload,
  normalizeDailyWarmupRotationTime,
  parsePatientHomeDailyWarmupRotationTimes,
} from '@/modules/patient-home/patientHomeDailyWarmupRotationSettings';
import { normalizeAdminIncidentAlertConfigForAdminPatch } from '@/modules/admin-incidents/adminIncidentAlertConfig';
import { normalizeOperatorHealthAlertConfigForAdminPatch } from '@/modules/operator-alerts/operatorHealthAlertConfig';
import { normalizeOperatorAlertFallbackEmail } from '@/modules/operator-alerts/operatorAlertFallbackEmail';
import { parseSmtpOutboundPatchValue } from '@/modules/system-settings/smtpOutboundPatch';
import { SERVER_RUNTIME_INTEGER_DEFINITIONS } from '@/modules/system-settings/runtimeConfig';
import {
  hasStoredWebPushVapidPrivate,
  parseWebPushVapidPatchValue,
} from '@/modules/system-settings/webPushVapidPatch';
import { redactAdminSettingsForClient } from '@/modules/system-settings/webPushVapidRuntime';
import { normalizePatientDefaultPromoTreatmentProgramTemplatePatch } from '@/modules/system-settings/patientDefaultPromoTreatmentProgramTemplate';
import {
  normalizeOrgCustomDomainHostnamePatch,
  ORG_CUSTOM_DOMAIN_HOSTNAME_KEY,
} from '@/modules/system-settings/orgCustomDomainHostname';
import type { CustomDomainBindingState } from '@/modules/custom-domain-binding/ports';
import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import { normalizeDoctorTodayPreferences } from '@/modules/system-settings/doctorTodayPreferences';
import {
  isPlatformIntegrationAvailable,
  type PlatformIntegrationId,
} from '@/modules/system-settings/platformIntegrationAvailability';
import { withPendingClinicDeliveryReadiness } from '@/modules/system-settings/clinicDeliveryReadiness';
import {
  parseClinicBotPatchValue,
  type ClinicBotPatchError,
} from '@/modules/system-settings/clinicBotPatch';
import {
  DOCTOR_WORKSPACE_CLIENT_DEFAULTS_KEY,
  DOCTOR_WORKSPACE_COMPOSITION_KEY,
  normalizeDoctorWorkspaceClientDefaults,
  normalizeDoctorWorkspaceComposition,
} from '@/modules/system-settings/doctorWorkspaceComposition';
import {
  normalizePatientLabel,
  normalizeSupportGroupLabel,
  SUPPORT_GROUP_LABEL_KEY,
} from '@/modules/system-settings/patientTerms';

/** Owner-facing reasons for a rejected dedicated bot configuration. */
const CLINIC_BOT_PATCH_MESSAGES: Readonly<Record<ClinicBotPatchError, string>> = {
  credential_required: 'Сначала сохраните credential бота.',
  invalid_bot_public_id:
    'Укажите публичный ник бота: латиница, цифры и подчёркивание, 3–64 символа.',
  invalid_destination_chat_id: 'Id чата для пересылки — целое число, как его выдаёт мессенджер.',
  forwarding_destination_required: 'Чтобы включить пересылку, укажите id чата, куда пересылать.',
};

/** Single-key PATCH: boolean keys normalized like `video_watermark_enabled`. */
const ADMIN_BOOLEAN_SETTING_KEYS = new Set<string>([
  'clinic_root_skip_public_card',
  'booking_calendar_show_working_hours',
  'booking_payment_enabled',
  'material_ratings_enabled',
  'specialist_signup_enabled',
  'video_watermark_enabled',
  'video_playback_api_enabled',
  'video_hls_pipeline_enabled',
  'video_hls_new_uploads_auto_transcode',
  'video_hls_reconcile_enabled',
  'patient_home_daily_warmup_rotation_enabled',
  'patient_home_warmup_skip_to_next_available_enabled',
  'patient_program_discussion_doctor_reply_from_log_enabled',
  'patient_program_discussion_ui_enabled',
  'patient_program_discussion_media_submission_enabled',
]);

const ADMIN_SCOPE_KEYS = [
  'sms_fallback_enabled',
  'material_ratings_enabled',
  'important_fallback_delay_minutes',
  'support_contact_url',
  'telegram_login_bot_username',
  'max_login_bot_nickname',
  'max_bot_api_key',
  'therapygo_max_bot_api_key',
  'therapysto_max_bot_api_key',
  'therapygo_max_webhook_secret',
  'therapysto_max_webhook_secret',
  'max_webhook_secret',
  'max_api_base_url',
  'telegram_bot_token',
  'therapygo_telegram_bot_token',
  'therapysto_telegram_bot_token',
  'therapygo_telegram_webhook_secret',
  'therapysto_telegram_webhook_secret',
  'therapygo_telegram_mode',
  'therapysto_telegram_mode',
  'telegram_webhook_secret',
  'telegram_send_menu_on_button_press',
  'vk_web_login_url',
  'app_display_timezone',
  'patient_app_maintenance_enabled',
  'patient_app_maintenance_message',
  'specialist_signup_enabled',
  'patient_program_discussion_doctor_reply_from_log_enabled',
  'patient_program_discussion_ui_enabled',
  'patient_program_discussion_media_submission_enabled',
  'video_hls_pipeline_enabled',
  'video_hls_new_uploads_auto_transcode',
  'video_hls_reconcile_enabled',
  'video_playback_api_enabled',
  'video_presign_ttl_seconds',
  'video_watermark_enabled',
  'patient_booking_url',
  'clinic_root_skip_public_card',
  'booking_default_organization_id',
  'booking_calendar_show_working_hours',
  'booking_min_notice_hours',
  'booking_availability_horizon_days',
  'booking_payment_enabled',
  'booking_payment_providers',
  'saas_billing_payment_provider',
  'booking_lifecycle_notifications',
  'patient_default_promo_treatment_program_template_id',
  'patient_home_daily_practice_target',
  'patient_home_daily_warmup_rotation_enabled',
  'patient_home_daily_warmup_rotation_times',
  'patient_home_daily_warmup_repeat_cooldown_minutes',
  'patient_treatment_plan_item_done_repeat_cooldown_minutes',
  'patient_home_warmup_skip_to_next_available_enabled',
  'notifications_topics',
  'jitsi_public_url',
  'jitsi_jwt_issuer',
  'jitsi_jwt_application_id',
  'jitsi_jwt_signing_secret',
  'jitsi_xmpp_domain',
  'smtp_outbound',
  'therapygo_smtp_outbound',
  'therapysto_smtp_outbound',
  'clinic_smtp_outbound',
  'clinic_smsc_api_key',
  'clinic_telegram_bot_token',
  'clinic_max_bot_api_key',
  'clinic_vk_community_access_token',
  'operator_health_imap',
  'web_push_vapid',
  'rustore_universal_push_therapygo',
  'rustore_universal_push_therapysto',
  'smsc_enabled',
  'smsc_api_key',
  'smsc_base_url',
  'yandex_oauth_client_id',
  'yandex_oauth_client_secret',
  'yandex_oauth_redirect_uri',
  'vk_id_application_id',
  'vk_id_client_secret',
  'vk_id_redirect_uri',
  // Google Calendar OAuth + integration
  'google_client_id',
  'google_client_secret',
  'google_redirect_uri',
  'google_refresh_token',
  'google_calendar_id',
  'google_calendar_enabled',
  'google_connected_email',
  'google_oauth_login_redirect_uri',
  'apple_oauth_client_id',
  'apple_oauth_team_id',
  'apple_oauth_key_id',
  'apple_oauth_private_key',
  'apple_oauth_redirect_uri',
  // Whitelist IDs
  'allowed_telegram_ids',
  'allowed_max_ids',
  'admin_telegram_ids',
  'doctor_telegram_ids',
  'admin_max_ids',
  'doctor_max_ids',
  'admin_phones',
  'doctor_phones',
  'allowed_phones',
  'admin_incident_alert_config',
  'operator_health_alert_config',
  'operator_alert_fallback_email',
  'operator_health_probe_config',
  'operator_heartbeat_config',
  ORG_CUSTOM_DOMAIN_HOSTNAME_KEY,
] as const;

const DOCTOR_SCOPE_KEYS = [
  'patient_label',
  SUPPORT_GROUP_LABEL_KEY,
  DOCTOR_WORKSPACE_COMPOSITION_KEY,
  DOCTOR_WORKSPACE_CLIENT_DEFAULTS_KEY,
  'doctor_patient_support_comments_without_support_default_enabled',
  'doctor_patient_support_media_without_support_default_enabled',
  'doctor_specialist_task_reminder_channels',
  'doctor_today_preferences',
  'doctor_appointment_reminder_enabled',
  'doctor_appointment_reminder_offsets_minutes',
  'booking_calendar_default_branch_id',
  'booking_calendar_default_service_id',
] as const;

const PATCH_SCOPE_KEYS = [...ADMIN_SCOPE_KEYS, ...DOCTOR_SCOPE_KEYS] as const;

const patchSchema = z
  .object({
    key: z.enum(PATCH_SCOPE_KEYS),
    value: z.unknown().optional(),
    placement: z.enum(['apex', 'subdomain']).optional(),
    subdomainLabel: z.unknown().optional(),
    action: z.literal('recheck').optional(),
  })
  .superRefine((value, ctx) => {
    const isDomainRecheck =
      value.key === ORG_CUSTOM_DOMAIN_HOSTNAME_KEY && value.action === 'recheck';
    if (!isDomainRecheck && value.value === undefined) {
      ctx.addIssue({ code: 'custom', message: 'value_required', path: ['value'] });
    }
  });
const deleteSchema = z.object({ key: z.literal('operator_health_probe_config') });

const modesBatchBodySchema = z.object({
  items: z
    .array(
      z.object({
        key: z.enum(MODES_FORM_KEYS),
        value: z.unknown(),
      }),
    )
    .min(1),
});

const WORKSPACE_SETTINGS_BATCH_KEYS = [
  DOCTOR_WORKSPACE_COMPOSITION_KEY,
  DOCTOR_WORKSPACE_CLIENT_DEFAULTS_KEY,
  'patient_label',
  SUPPORT_GROUP_LABEL_KEY,
] as const;

const workspaceSettingsBatchSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            key: z.enum(WORKSPACE_SETTINGS_BATCH_KEYS),
            value: z.unknown(),
          })
          .strict(),
      )
      .length(WORKSPACE_SETTINGS_BATCH_KEYS.length),
  })
  .strict();

// Redaction policy (что считается секретом и как его прятать) живёт в одном месте —
// `SYSTEM_SETTING_REGISTRY[key].secretAudit` (`modules/system-settings/registry.ts`), которую читает
// `redactSettingValueForAudit`. Раньше здесь и в `auditRedaction.ts` были два независимых
// hand-maintained списка ключей: аудит 28.07 нашёл `vk_id_client_secret` в `system_settings_audit`
// как есть (лог редактировал, журнал — нет), а аудит #1071 (2026-09-02) нашёл `web_push_vapid`,
// `booking_payment_providers` и `saas_billing_payment_provider` в журнале как есть (ни один из двух
// списков их не знал). Лог-строка ниже и журнал (`pgSystemSettings.ts`) теперь вызывают одну и ту же
// функцию на одних и тех же registry-производных правилах, так что второй раз это разойтись не может.

/** Patient-home editorial controls are owner content controls, not ordinary clinic-management settings. */
const OWNER_ONLY_PATIENT_HOME_KEYS = new Set<string>([
  'patient_home_daily_practice_target',
  'patient_home_daily_warmup_rotation_enabled',
  'patient_home_daily_warmup_rotation_times',
  'patient_home_daily_warmup_repeat_cooldown_minutes',
  'patient_treatment_plan_item_done_repeat_cooldown_minutes',
]);

/** Personal domain hostname is an owner-level clinic identity control (UX-05 / owner 05.08). */
const OWNER_ONLY_CUSTOM_DOMAIN_SETTING_KEYS = new Set<string>([ORG_CUSTOM_DOMAIN_HOSTNAME_KEY]);

const PAYMENT_ENTITLEMENT_SETTING_KEYS = new Set([
  'booking_payment_providers',
  'booking_payment_enabled',
]);

const EXTERNAL_CALENDAR_ENTITLEMENT_SETTING_KEYS = new Set([
  'google_refresh_token',
  'google_calendar_id',
  'google_calendar_enabled',
  'google_connected_email',
]);

const CLINIC_DELIVERY_CHANNEL_ENTITLEMENTS = new Map<
  string,
  {
    mechanics: readonly OrgMechanic[];
    action: string;
  }
>([
  ['clinic_smtp_outbound', { mechanics: ['clinic_smtp'], action: 'настроить собственный SMTP' }],
  ['clinic_smsc_api_key', { mechanics: ['clinic_sms'], action: 'настроить собственный SMS-канал' }],
  [
    'clinic_telegram_bot_token',
    {
      mechanics: ['branding', 'clinic_telegram_bot'],
      action: 'настроить собственного Telegram-бота',
    },
  ],
  [
    'clinic_max_bot_api_key',
    {
      mechanics: ['branding', 'clinic_max_bot'],
      action: 'настроить собственного MAX-бота',
    },
  ],
  [
    'clinic_vk_community_access_token',
    { mechanics: ['clinic_vk_community'], action: 'настроить собственное сообщество VK' },
  ],
]);

const CLINIC_DELIVERY_SETTING_INTEGRATIONS = new Map<string, PlatformIntegrationId>([
  ['clinic_smtp_outbound', 'email'],
  ['clinic_smsc_api_key', 'smsc'],
  ['clinic_telegram_bot_token', 'telegram'],
  ['clinic_max_bot_api_key', 'max'],
  ['clinic_vk_community_access_token', 'vk'],
]);

async function readClinicDeliveryIntegrationState(
  systemSettings: ReturnType<typeof buildAppDeps>['systemSettings'],
  integration: PlatformIntegrationId,
  organizationId: string,
): Promise<'enabled' | 'disabled' | 'unavailable'> {
  try {
    const availability = await systemSettings.getClinicPlatformIntegrationAvailability();
    return isPlatformIntegrationAvailable(availability, integration) ? 'enabled' : 'disabled';
  } catch (error) {
    console.error('[clinic-delivery] platform integration availability read failed', {
      organizationId,
      integration,
      error,
    });
    return 'unavailable';
  }
}

const PATIENT_HOME_TODAY_ENTITLEMENT_SETTING_KEYS = new Set([
  'patient_home_daily_practice_target',
  'patient_home_daily_warmup_rotation_enabled',
  'patient_home_daily_warmup_rotation_times',
  'patient_home_daily_warmup_repeat_cooldown_minutes',
  'patient_treatment_plan_item_done_repeat_cooldown_minutes',
  'patient_home_warmup_skip_to_next_available_enabled',
]);

const WARMUPS_ENTITLEMENT_SETTING_KEYS = new Set([
  'patient_home_daily_warmup_rotation_enabled',
  'patient_home_daily_warmup_rotation_times',
  'patient_home_daily_warmup_repeat_cooldown_minutes',
  'patient_home_warmup_skip_to_next_available_enabled',
]);

const PROMO_ENTITLEMENT_SETTING_KEYS = new Set([
  'patient_default_promo_treatment_program_template_id',
]);

const CUSTOM_DOMAIN_ENTITLEMENT_SETTING_KEYS = new Set<string>([ORG_CUSTOM_DOMAIN_HOSTNAME_KEY]);
const PLATFORM_PATIENT_HOSTNAME = 'therapygo.ru';

function isPlatformOwnedCustomDomain(baseDomain: string): boolean {
  const platformHosts = [PLATFORM_PATIENT_HOSTNAME];
  try {
    platformHosts.push(new URL(PATIENT_DEFAULT_SURFACE.origin).hostname.toLowerCase());
    platformHosts.push(new URL(STAFF_SURFACE.origin).hostname.toLowerCase());
  } catch {
    // TEST's one-host compatibility has no patient origin; the permanent platform namespace above
    // remains protected.
  }
  return platformHosts.some((host) => baseDomain === host || baseDomain.endsWith(`.${host}`));
}

type SettingsApiContext =
  | {
      kind: 'platform';
      session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>;
      organizationId: null;
    }
  | {
      kind: 'clinic';
      session: DoctorWorkspaceAccessContext['session'];
      organizationId: string;
      workspace: DoctorWorkspaceAccessContext;
    };

async function requireSettingsApiContext(): Promise<
  { ok: true; ctx: SettingsApiContext } | { ok: false; response: NextResponse }
> {
  const session = await getCurrentSession();
  const isPlatformOperations =
    session != null &&
    hasLaunchCapability(
      resolveLaunchCapabilities({
        sessionRole: session.user.role,
      }),
      'platform.operations',
    );

  if (isPlatformOperations) {
    const gate = await requirePlatformOperationsApiContext();
    if (!gate.ok) return gate;
    return {
      ok: true,
      ctx: {
        kind: 'platform',
        session: gate.session,
        organizationId: null,
      },
    };
  }

  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate;
  return {
    ok: true,
    ctx: {
      kind: 'clinic',
      session: gate.ctx.session,
      organizationId: gate.ctx.organizationId,
      workspace: gate.ctx,
    },
  };
}

function settingScopeForKey(key: (typeof PATCH_SCOPE_KEYS)[number]): 'admin' | 'doctor' {
  return (DOCTOR_SCOPE_KEYS as readonly string[]).includes(key) ? 'doctor' : 'admin';
}

export async function GET() {
  const gate = await requireSettingsApiContext();
  if (!gate.ok) return gate.response;

  const organizationId = gate.ctx.organizationId;
  const deps = buildAppDeps();
  const [adminSettings, doctorSettings] = await Promise.all([
    deps.systemSettings.listSettingsByScope('admin', { organizationId }),
    deps.systemSettings.listSettingsByScope('doctor', { organizationId }),
  ]);
  const allSettings = redactAdminSettingsForClient([...adminSettings, ...doctorSettings]);
  const settings =
    gate.ctx.kind === 'platform'
      ? allSettings
      : allSettings.filter((setting) => isPerOrgSettingKey(setting.key));
  const domainBinding =
    gate.ctx.kind === 'clinic' && deps.customDomainBinding
      ? await deps.customDomainBinding.getBindingState(gate.ctx.organizationId)
      : undefined;
  return NextResponse.json({
    ok: true,
    settings,
    ...(domainBinding !== undefined ? { domainBinding } : {}),
  });
}

export async function PATCH(request: Request) {
  const gate = await requireSettingsApiContext();
  if (!gate.ok) return gate.response;

  const session = gate.ctx.session;
  const organizationId = gate.ctx.organizationId;
  const allowGlobalSettings = gate.ctx.kind === 'platform';
  const raw = (await request.json().catch(() => null)) as unknown;

  if (raw !== null && typeof raw === 'object' && 'items' in raw) {
    const body = raw as Record<string, unknown>;
    const itemsRaw = body.items;
    if (itemsRaw !== null && itemsRaw !== undefined && !Array.isArray(itemsRaw)) {
      return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
    }
    if (Array.isArray(itemsRaw)) {
      if (typeof body.key === 'string' && itemsRaw.length >= 1) {
        return NextResponse.json({ ok: false, error: 'ambiguous_body' }, { status: 400 });
      }
      if (itemsRaw.length === 0) {
        return NextResponse.json({ ok: false, error: 'empty_batch' }, { status: 400 });
      }
      const hasWorkspaceSetting = itemsRaw.some(
        (item) =>
          item !== null &&
          typeof item === 'object' &&
          'key' in item &&
          typeof item.key === 'string' &&
          (WORKSPACE_SETTINGS_BATCH_KEYS as readonly string[]).includes(item.key),
      );
      if (hasWorkspaceSetting) {
        const workspaceBatch = workspaceSettingsBatchSchema.safeParse(raw);
        if (!workspaceBatch.success) {
          return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
        }
        if (gate.ctx.kind !== 'clinic') {
          return NextResponse.json(
            { ok: false, error: 'organization_context_required' },
            { status: 403 },
          );
        }
        const seen = new Set<string>();
        for (let i = 0; i < workspaceBatch.data.items.length; i++) {
          const key = workspaceBatch.data.items[i]!.key;
          if (seen.has(key)) {
            return NextResponse.json(
              { ok: false, error: 'duplicate_key_in_batch', atIndex: i, key },
              { status: 400 },
            );
          }
          seen.add(key);
        }
        const rows: Array<{
          key: (typeof WORKSPACE_SETTINGS_BATCH_KEYS)[number];
          scope: 'doctor';
          value: { value: unknown };
        }> = [];
        for (let i = 0; i < workspaceBatch.data.items.length; i++) {
          const item = workspaceBatch.data.items[i]!;
          const inner = normalizeValueJson(item.value).value;
          const normalized =
            item.key === DOCTOR_WORKSPACE_COMPOSITION_KEY
              ? normalizeDoctorWorkspaceComposition(inner)
              : item.key === DOCTOR_WORKSPACE_CLIENT_DEFAULTS_KEY
                ? normalizeDoctorWorkspaceClientDefaults(inner)
                : item.key === 'patient_label'
                  ? normalizePatientLabel(inner)
                  : normalizeSupportGroupLabel(inner);
          if (normalized === null) {
            return NextResponse.json(
              { ok: false, error: 'invalid_value', atIndex: i, key: item.key },
              { status: 400 },
            );
          }
          rows.push({ key: item.key, scope: 'doctor', value: { value: normalized } });
        }
        const deps = buildAppDeps();
        for (const row of rows) {
          const oldSetting = await deps.systemSettings.getSetting(row.key, 'doctor', {
            organizationId,
          });
          console.info('[admin-settings audit]', {
            key: row.key,
            oldValue: redactSettingValueForAudit(row.key, oldSetting?.valueJson ?? null),
            newValue: redactSettingValueForAudit(row.key, row.value),
            updatedBy: session.user.userId,
            timestamp: new Date().toISOString(),
          });
        }
        try {
          const settings = await deps.systemSettings.persistSettingsBatch(
            rows,
            session.user.userId,
            { organizationId },
          );
          return NextResponse.json({ ok: true, settings });
        } catch (error) {
          const errResponse = systemSettingsOrgContextErrorResponse(error);
          if (errResponse) return errResponse;
          console.error('[admin-settings] atomic batch failed', {
            operation: 'doctor-workspace',
            errorClass: error instanceof Error ? error.name : 'unknown',
          });
          return NextResponse.json(
            { ok: false, error: 'settings_write_unavailable' },
            { status: 503 },
          );
        }
      }
      const batchParsed = modesBatchBodySchema.safeParse(raw);
      if (!batchParsed.success) {
        return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
      }
      const items = batchParsed.data.items;
      if (!allowGlobalSettings) {
        const globalKey = items.find((item) => !isPerOrgSettingKey(item.key))?.key ?? null;
        if (globalKey) {
          return NextResponse.json(
            { ok: false, error: 'forbidden_global_setting', key: globalKey },
            { status: 403 },
          );
        }
      }
      const seen = new Set<string>();
      for (let i = 0; i < items.length; i++) {
        const k = items[i]!.key;
        if (seen.has(k)) {
          return NextResponse.json(
            { ok: false, error: 'duplicate_key_in_batch', atIndex: i, key: k },
            { status: 400 },
          );
        }
        seen.add(k);
      }
      for (let i = 0; i < items.length; i++) {
        if (!(ALLOWED_KEYS as readonly string[]).includes(items[i]!.key)) {
          return NextResponse.json(
            { ok: false, error: 'invalid_key', atIndex: i, key: items[i]!.key },
            { status: 400 },
          );
        }
      }
      const norm = normalizeModesFormBatchItems(items);
      if (!norm.ok) {
        return NextResponse.json(
          { ok: false, error: 'invalid_value', atIndex: norm.atIndex, key: norm.key },
          { status: 400 },
        );
      }
      const deps = buildAppDeps();
      for (const row of norm.rows) {
        const oldSetting = await deps.systemSettings.getSetting(row.key, 'admin', {
          organizationId,
        });
        console.info('[admin-settings audit]', {
          key: row.key,
          oldValue: redactSettingValueForAudit(row.key, oldSetting?.valueJson ?? null),
          newValue: redactSettingValueForAudit(row.key, row.valueJson),
          updatedBy: session.user.userId,
          timestamp: new Date().toISOString(),
        });
      }
      try {
        const settings = redactAdminSettingsForClient(
          await deps.systemSettings.persistAdminModesBatch(norm.rows, session.user.userId, {
            organizationId,
            ...(allowGlobalSettings ? { allowPlatformGlobalFallbackWrite: true as const } : {}),
          }),
        );
        return NextResponse.json({ ok: true, settings });
      } catch (error) {
        const errResponse = systemSettingsOrgContextErrorResponse(error);
        if (errResponse) return errResponse;
        throw error;
      }
    }
  }

  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  // Проверка что ключ входит в глобальный whitelist
  if (!(ALLOWED_KEYS as readonly string[]).includes(parsed.data.key)) {
    return NextResponse.json({ ok: false, error: 'invalid_key' }, { status: 400 });
  }
  if (!allowGlobalSettings && !isPerOrgSettingKey(parsed.data.key)) {
    return NextResponse.json(
      { ok: false, error: 'forbidden_global_setting', key: parsed.data.key },
      { status: 403 },
    );
  }
  const deps = buildAppDeps();
  if (PAYMENT_ENTITLEMENT_SETTING_KEYS.has(parsed.data.key) && gate.ctx.kind === 'clinic') {
    const entitlement = await requireEntitlementForMutation(gate.ctx.workspace, 'payments');
    if (!entitlement.ok) return entitlement.response;
  }
  if (
    EXTERNAL_CALENDAR_ENTITLEMENT_SETTING_KEYS.has(parsed.data.key) &&
    gate.ctx.kind === 'clinic'
  ) {
    const entitlement = await requireEntitlementForMutation(
      gate.ctx.workspace,
      'external_calendar',
    );
    if (!entitlement.ok) {
      return entitlementMutationRefusalResponse(
        'external_calendar',
        'изменить или отключить внешний календарь',
      );
    }
  }
  const clinicDeliveryEntitlement = CLINIC_DELIVERY_CHANNEL_ENTITLEMENTS.get(parsed.data.key);
  if (clinicDeliveryEntitlement && gate.ctx.kind === 'clinic') {
    for (const mechanic of clinicDeliveryEntitlement.mechanics) {
      const entitlement = await requireEntitlementForMutation(gate.ctx.workspace, mechanic);
      if (!entitlement.ok) {
        return entitlementMutationRefusalResponse(mechanic, clinicDeliveryEntitlement.action);
      }
    }
    const integration = CLINIC_DELIVERY_SETTING_INTEGRATIONS.get(parsed.data.key)!;
    const integrationState = await readClinicDeliveryIntegrationState(
      deps.systemSettings,
      integration,
      gate.ctx.organizationId,
    );
    if (integrationState === 'unavailable') {
      return NextResponse.json(
        {
          ok: false,
          error: 'integration_availability_unavailable',
          message: 'Сервер не смог проверить доступность интеграции. Повторите позже.',
        },
        { status: 503 },
      );
    }
    if (integrationState === 'disabled') {
      return NextResponse.json(
        {
          ok: false,
          error: 'integration_disabled',
          integration,
          message:
            integration === 'email'
              ? 'SMTP отключён платформой.'
              : 'Интеграция отключена платформой.',
        },
        { status: 403 },
      );
    }
  }
  if (
    PATIENT_HOME_TODAY_ENTITLEMENT_SETTING_KEYS.has(parsed.data.key) &&
    gate.ctx.kind === 'clinic'
  ) {
    const entitlement = await requireEntitlementForMutation(
      gate.ctx.workspace,
      'patient_home_today',
    );
    if (!entitlement.ok) {
      return entitlementMutationRefusalResponse(
        'patient_home_today',
        'изменить настройки главной страницы пациента',
      );
    }
  }
  if (WARMUPS_ENTITLEMENT_SETTING_KEYS.has(parsed.data.key) && gate.ctx.kind === 'clinic') {
    const entitlement = await requireEntitlementForMutation(gate.ctx.workspace, 'warmups');
    if (!entitlement.ok) {
      return entitlementMutationRefusalResponse('warmups', 'изменить настройки разминок');
    }
  }
  if (PROMO_ENTITLEMENT_SETTING_KEYS.has(parsed.data.key) && gate.ctx.kind === 'clinic') {
    const entitlement = await requireEntitlementForMutation(gate.ctx.workspace, 'promo');
    if (!entitlement.ok) {
      return entitlementMutationRefusalResponse('promo', 'изменить промо-программу');
    }
  }
  if (CUSTOM_DOMAIN_ENTITLEMENT_SETTING_KEYS.has(parsed.data.key) && gate.ctx.kind === 'clinic') {
    const entitlement = await requireEntitlementForMutation(gate.ctx.workspace, 'custom_domain');
    if (!entitlement.ok) {
      return entitlementMutationRefusalResponse(
        'custom_domain',
        'изменить собственный домен клиники',
      );
    }
  }
  if (
    OWNER_ONLY_PATIENT_HOME_KEYS.has(parsed.data.key) &&
    !allowGlobalSettings &&
    gate.ctx.kind === 'clinic' &&
    gate.ctx.workspace.membershipRole !== 'owner'
  ) {
    return NextResponse.json(
      { ok: false, error: 'forbidden_owner_setting', key: parsed.data.key },
      { status: 403 },
    );
  }
  if (
    OWNER_ONLY_CUSTOM_DOMAIN_SETTING_KEYS.has(parsed.data.key) &&
    !allowGlobalSettings &&
    gate.ctx.kind === 'clinic' &&
    gate.ctx.workspace.membershipRole !== 'owner'
  ) {
    return NextResponse.json(
      { ok: false, error: 'forbidden_owner_setting', key: parsed.data.key },
      { status: 403 },
    );
  }

  if (parsed.data.key === ORG_CUSTOM_DOMAIN_HOSTNAME_KEY && parsed.data.action === 'recheck') {
    if (gate.ctx.kind !== 'clinic' || !deps.customDomainBinding) {
      return NextResponse.json(
        { ok: false, error: 'organization_context_required' },
        { status: 403 },
      );
    }
    const binding = await deps.customDomainBinding.getBindingState(gate.ctx.organizationId);
    if (!binding) {
      return NextResponse.json({ ok: false, error: 'custom_domain_not_found' }, { status: 404 });
    }
    const { runDomainHealthTick } = await import('@/app-layer/health/runDomainHealthTick');
    const verification = await runWithDbInfraPrincipal(
      { source: 'api/admin/settings:custom-domain-recheck' },
      () => runDomainHealthTick(undefined, { hostname: binding.hostname }),
    );
    if (verification.checked !== 1) {
      return NextResponse.json(
        { ok: false, error: 'custom_domain_verification_target_unavailable' },
        { status: 503 },
      );
    }
    const domainBinding = await deps.customDomainBinding.getBindingState(gate.ctx.organizationId);
    return NextResponse.json({ ok: true, domainBinding, verification });
  }

  const settingScope = settingScopeForKey(parsed.data.key);

  let normalizedValue = normalizeValueJson(parsed.data.value);

  if (parsed.data.key === 'patient_label') {
    const label = normalizePatientLabel(normalizedValue.value);
    if (label === null) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: label };
  }

  if (parsed.data.key === SUPPORT_GROUP_LABEL_KEY) {
    const label = normalizeSupportGroupLabel(normalizedValue.value);
    if (label === null) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: label };
  }

  if (parsed.data.key === DOCTOR_WORKSPACE_COMPOSITION_KEY) {
    const composition = normalizeDoctorWorkspaceComposition(normalizedValue.value);
    if (composition === null) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: composition };
  }

  if (parsed.data.key === DOCTOR_WORKSPACE_CLIENT_DEFAULTS_KEY) {
    const defaults = normalizeDoctorWorkspaceClientDefaults(normalizedValue.value);
    if (defaults === null) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: defaults };
  }

  if (
    parsed.data.key === 'saas_billing_payment_provider' &&
    !isValidSaasBillingPaymentProviderFiscalSettings(normalizedValue)
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
  }

  if (isModesFormKey(parsed.data.key)) {
    const checked = normalizeModesFormPatchItem(parsed.data.key, parsed.data.value);
    if (!checked.ok) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = checked.valueJson;
  }

  const bookingIntegerDefinition =
    parsed.data.key === 'booking_min_notice_hours'
      ? SERVER_RUNTIME_INTEGER_DEFINITIONS.booking_min_notice_hours
      : parsed.data.key === 'booking_availability_horizon_days'
        ? SERVER_RUNTIME_INTEGER_DEFINITIONS.booking_availability_horizon_days
        : null;
  if (bookingIntegerDefinition) {
    const inner = normalizedValue.value;
    const n =
      typeof inner === 'number' && Number.isInteger(inner)
        ? inner
        : typeof inner === 'string' && /^\d+$/.test(inner.trim())
          ? Number.parseInt(inner.trim(), 10)
          : NaN;
    if (
      !Number.isFinite(n) ||
      n < bookingIntegerDefinition.minValue ||
      n > bookingIntegerDefinition.maxValue
    ) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: n };
  }

  if (ADMIN_BOOLEAN_SETTING_KEYS.has(parsed.data.key)) {
    const b = coerceAdminBooleanSetting(normalizedValue.value);
    if (b === null) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: b };
  }

  if (
    parsed.data.key === 'doctor_patient_support_comments_without_support_default_enabled' ||
    parsed.data.key === 'doctor_patient_support_media_without_support_default_enabled' ||
    parsed.data.key === 'doctor_appointment_reminder_enabled'
  ) {
    const b = coerceAdminBooleanSetting(normalizedValue.value);
    if (b === null) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: b };
  }

  if (parsed.data.key === 'doctor_appointment_reminder_offsets_minutes') {
    const inner = normalizedValue.value;
    if (
      !Array.isArray(inner) ||
      inner.some((value) => typeof value !== 'number' || !Number.isInteger(value) || value <= 0)
    ) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: inner };
  }

  if (parsed.data.key === 'doctor_today_preferences') {
    const checked = normalizeDoctorTodayPreferences(normalizedValue.value);
    if (!checked) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: checked };
  }

  if (parsed.data.key === 'video_presign_ttl_seconds') {
    const inner = normalizedValue.value;
    const n =
      typeof inner === 'number' && Number.isInteger(inner)
        ? inner
        : typeof inner === 'string' && /^\d+$/.test(inner.trim())
          ? Number.parseInt(inner.trim(), 10)
          : NaN;
    if (!Number.isFinite(n) || n < VIDEO_PRESIGN_TTL_MIN_SEC || n > VIDEO_PRESIGN_TTL_MAX_SEC) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: n };
  }

  if (parsed.data.key === 'patient_home_daily_practice_target') {
    const inner = normalizedValue.value;
    const n =
      typeof inner === 'number' && Number.isInteger(inner)
        ? inner
        : typeof inner === 'string' && /^\d+$/.test(inner.trim())
          ? Number.parseInt(inner.trim(), 10)
          : NaN;
    if (!Number.isFinite(n) || n < 1 || n > 10) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: n };
  }

  if (
    parsed.data.key === 'patient_home_daily_warmup_repeat_cooldown_minutes' ||
    parsed.data.key === 'patient_treatment_plan_item_done_repeat_cooldown_minutes'
  ) {
    const inner = normalizedValue.value;
    const n =
      typeof inner === 'number' && Number.isInteger(inner)
        ? inner
        : typeof inner === 'string' && /^\d+$/.test(inner.trim())
          ? Number.parseInt(inner.trim(), 10)
          : NaN;
    if (
      !Number.isFinite(n) ||
      n < PATIENT_REPEAT_COOLDOWN_MINUTES_MIN ||
      n > PATIENT_REPEAT_COOLDOWN_MINUTES_MAX
    ) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: n };
  }

  if (parsed.data.key === 'patient_home_daily_warmup_rotation_times') {
    const inner = normalizedValue.value;
    if (!isValidPatientHomeDailyWarmupRotationTimesPayload(inner)) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    const sorted = [...inner]
      .map((t) => normalizeDailyWarmupRotationTime(t))
      .filter((t): t is string => t !== null)
      .sort();
    normalizedValue = { value: parsePatientHomeDailyWarmupRotationTimes({ value: sorted }) };
  }

  if (parsed.data.key === 'patient_default_promo_treatment_program_template_id') {
    const checked = await normalizePatientDefaultPromoTreatmentProgramTemplatePatch(
      (id) => deps.treatmentProgram.getTemplate(id),
      normalizedValue,
    );
    if (!checked.ok) {
      return NextResponse.json({ ok: false, error: checked.error }, { status: 400 });
    }
    normalizedValue = checked.valueJson;
  }

  /** The browser sends a base domain plus placement; server derives the only allowed prefix. */
  let orgCustomDomainIntentPatch:
    | { kind: 'clear' }
    | { kind: 'set'; baseDomain: string; placement: 'apex' | 'subdomain'; subdomainLabel?: unknown }
    | null = null;
  if (parsed.data.key === ORG_CUSTOM_DOMAIN_HOSTNAME_KEY) {
    // Accept the prior nested envelope for HTTP compatibility, but never pass its label on.
    const legacyEnvelope =
      normalizedValue.value !== null && typeof normalizedValue.value === 'object'
        ? (normalizedValue.value as Record<string, unknown>)
        : null;
    const baseDomain = legacyEnvelope?.value ?? normalizedValue.value;
    const placement =
      parsed.data.placement ??
      (legacyEnvelope?.placement === 'subdomain' ||
      (normalizedValue as Record<string, unknown>).placement === 'subdomain'
        ? 'subdomain'
        : 'apex');
    const checked = normalizeOrgCustomDomainHostnamePatch({ value: baseDomain });
    if (!checked.ok) {
      return NextResponse.json({ ok: false, error: checked.error }, { status: 400 });
    }
    normalizedValue = checked.valueJson;
    const hostnameValue = checked.valueJson.value;
    if (hostnameValue !== '' && isPlatformOwnedCustomDomain(hostnameValue)) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    orgCustomDomainIntentPatch =
      hostnameValue === ''
        ? { kind: 'clear' }
        : {
            kind: 'set',
            baseDomain: hostnameValue,
            placement,
          };
  }

  if (parsed.data.key === 'notifications_topics') {
    const inner = normalizedValue.value;
    const knownTopicCodes = new Set<string>();
    const checked = normalizeNotificationsTopicsForAdminPatch(inner, { knownTopicCodes });
    if (!checked.ok) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: checked.value };
  }

  if (parsed.data.key === 'admin_incident_alert_config') {
    const inner = normalizedValue.value;
    const checked = normalizeAdminIncidentAlertConfigForAdminPatch(inner);
    if (!checked.ok) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: checked.value };
  }

  if (parsed.data.key === 'operator_health_alert_config') {
    const inner = normalizedValue.value;
    const checked = normalizeOperatorHealthAlertConfigForAdminPatch(inner);
    if (!checked.ok) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: checked.value };
  }

  if (parsed.data.key === 'operator_alert_fallback_email') {
    const checked = normalizeOperatorAlertFallbackEmail(normalizedValue.value);
    if (!checked.ok) {
      const message =
        checked.error === 'required'
          ? 'Укажите резервный e-mail для операторских алертов.'
          : checked.error === 'too_long'
            ? 'Резервный e-mail не должен быть длиннее 320 символов.'
            : 'Укажите корректный резервный e-mail для операторских алертов.';
      return NextResponse.json(
        { ok: false, error: `operator_alert_fallback_email_${checked.error}`, message },
        { status: 400 },
      );
    }
    normalizedValue = { value: checked.value };
  }

  if (
    parsed.data.key === 'smtp_outbound' ||
    parsed.data.key === 'therapygo_smtp_outbound' ||
    parsed.data.key === 'therapysto_smtp_outbound' ||
    parsed.data.key === 'clinic_smtp_outbound'
  ) {
    const checked = parseSmtpOutboundPatchValue(normalizedValue);
    if (!checked.ok) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: checked.value };
  }

  if (parsed.data.key === 'clinic_smtp_outbound') {
    normalizedValue = withPendingClinicDeliveryReadiness(normalizedValue);
  }

  /** Prefetch for audit: avoid second `getSetting` for `web_push_vapid` (same row as validation). */
  let webPushVapidOldRowForAudit: SystemSetting | null | undefined;
  /** Same prefetch for the dedicated bot keys: the merge needs the stored envelope anyway. */
  let clinicBotOldRowForAudit: SystemSetting | null | undefined;

  if (
    parsed.data.key === 'clinic_telegram_bot_token' ||
    parsed.data.key === 'clinic_max_bot_api_key'
  ) {
    clinicBotOldRowForAudit = await deps.systemSettings.getSetting(parsed.data.key, 'admin', {
      organizationId,
    });
    const checked = parseClinicBotPatchValue({
      patchEnvelope: normalizedValue,
      existingValueJson: clinicBotOldRowForAudit?.valueJson ?? null,
    });
    if (!checked.ok) {
      return NextResponse.json(
        { ok: false, error: checked.error, message: CLINIC_BOT_PATCH_MESSAGES[checked.error] },
        { status: 400 },
      );
    }
    // Только смена самого credential обнуляет живую проверку канала: правка публичного ника или
    // настроек пересылки не делает уже доказанный канал неподтверждённым.
    normalizedValue = checked.credentialChanged
      ? (withPendingClinicDeliveryReadiness(checked.valueJson) as { value: unknown })
      : (checked.valueJson as { value: unknown });
  }
  if (parsed.data.key === 'web_push_vapid') {
    webPushVapidOldRowForAudit = await deps.systemSettings.getSetting('web_push_vapid', 'admin', {
      organizationId,
    });
    const hasExistingPrivate = hasStoredWebPushVapidPrivate(
      webPushVapidOldRowForAudit?.valueJson ?? null,
    );
    const checked = parseWebPushVapidPatchValue(normalizedValue, { hasExistingPrivate });
    if (!checked.ok) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: checked.value };
  }

  // Audit log перед обновлением (секреты редактируются без вывода raw значения в logs).
  const oldSetting =
    webPushVapidOldRowForAudit !== undefined
      ? webPushVapidOldRowForAudit
      : clinicBotOldRowForAudit !== undefined
        ? clinicBotOldRowForAudit
        : await deps.systemSettings.getSetting(parsed.data.key, settingScope, { organizationId });
  console.info('[admin-settings audit]', {
    key: parsed.data.key,
    oldValue: redactSettingValueForAudit(parsed.data.key, oldSetting?.valueJson ?? null),
    newValue: redactSettingValueForAudit(parsed.data.key, normalizedValue),
    updatedBy: session.user.userId,
    timestamp: new Date().toISOString(),
  });

  // The binding is canonical. Do not persist a settings value before its globally-unique claim
  // succeeds, otherwise a rejected hostname becomes a durable lie.
  let domainBinding: CustomDomainBindingState | null | undefined;
  if (orgCustomDomainIntentPatch && deps.customDomainBinding && organizationId) {
    const intentResult =
      orgCustomDomainIntentPatch.kind === 'clear'
        ? await deps.customDomainBinding.clearCustomDomainIntent({ organizationId })
        : await deps.customDomainBinding.setCustomDomainIntent({
            organizationId,
            baseDomain: orgCustomDomainIntentPatch.baseDomain,
            placement: orgCustomDomainIntentPatch.placement,
          });
    if (!intentResult.ok && intentResult.code !== 'nothing_to_clear') {
      return NextResponse.json(
        { ok: false, error: `custom_domain_${intentResult.code}` },
        { status: 409 },
      );
    }
    domainBinding = intentResult.ok ? intentResult.state : null;
  }

  let setting: SystemSetting;
  if (orgCustomDomainIntentPatch) {
    setting = {
      key: ORG_CUSTOM_DOMAIN_HOSTNAME_KEY,
      scope: settingScope,
      organizationId,
      valueJson: { value: domainBinding?.baseDomain ?? '' },
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.userId,
    };
  } else
    try {
      setting = await deps.systemSettings.updateSetting(
        parsed.data.key,
        settingScope,
        normalizedValue,
        session.user.userId,
        {
          organizationId,
          ...(allowGlobalSettings ? { allowPlatformGlobalFallbackWrite: true as const } : {}),
        },
      );
    } catch (error) {
      const errResponse = systemSettingsOrgContextErrorResponse(error);
      if (errResponse) return errResponse;
      // Only this module's own authored refusal may be named to the admin; a PostgreSQL failure or a
      // runtime bug keeps re-throwing to `onRequestError` instead of describing itself in the body.
      if (error instanceof OperatorHealthProbeConfigInvalidError)
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      throw error;
    }

  const clientSetting = redactAdminSettingsForClient([setting])[0]!;
  return NextResponse.json({
    ok: true,
    setting: clientSetting,
    ...(domainBinding !== undefined ? { domainBinding } : {}),
  });
}

export async function DELETE(request: Request) {
  const gate = await requireSettingsApiContext();
  if (!gate.ok) return gate.response;
  if (gate.ctx.kind !== 'platform') {
    return NextResponse.json({ ok: false, error: 'forbidden_global_setting' }, { status: 403 });
  }
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  const deleted = await buildAppDeps().systemSettings.clearSetting(
    parsed.data.key,
    'admin',
    gate.ctx.session.user.userId,
    { organizationId: null },
  );
  return NextResponse.json({ ok: true, deleted });
}
