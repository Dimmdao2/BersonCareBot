/**
 * GET  /api/admin/settings — список настроек scope=admin
 * PATCH /api/admin/settings — обновить ключ scope=admin
 * Guard: branch on the platform.operations capability. Global platform configuration uses
 * the dedicated platform principal and clinic managers keep the organization-scoped path.
 */
import {
  isPasswordBearingSettingKey,
  isSecretValueSettingKey,
  redactSettingValueForAudit,
} from '@/modules/system-settings/auditRedaction';
import { NextResponse } from 'next/server';
import { z } from 'zod';
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
import { ALLOWED_KEYS, type SystemSetting } from '@/modules/system-settings/types';
import { isPerOrgSettingKey } from '@/modules/system-settings/orgScopedKeys';
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
import { redactSaasBillingPaymentProviderValue } from '@/modules/saas-billing/settings';
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
import { normalizeOperatorHealthProjectionThresholdsForAdminPatch } from '@/modules/operator-health/operatorHealthProjectionThresholds';
import { parseSmtpOutboundPatchValue } from '@/modules/system-settings/smtpOutboundPatch';
import {
  hasStoredWebPushVapidPrivate,
  parseWebPushVapidPatchValue,
} from '@/modules/system-settings/webPushVapidPatch';
import { redactAdminSettingsForClient } from '@/modules/system-settings/webPushVapidRuntime';
import { normalizePatientDefaultPromoTreatmentProgramTemplatePatch } from '@/modules/system-settings/patientDefaultPromoTreatmentProgramTemplate';
import { normalizeDoctorTodayPreferences } from '@/modules/system-settings/doctorTodayPreferences';
import {
  parsePlatformIntegrationAvailabilityEnvelope,
  type PlatformIntegrationId,
} from '@/modules/system-settings/platformIntegrationAvailability';

/** Single-key PATCH: boolean keys normalized like `video_watermark_enabled`. */
const ADMIN_BOOLEAN_SETTING_KEYS = new Set<string>([
  'booking_allow_doctor_unlink_past_package_sessions',
  'booking_calendar_show_working_hours',
  'booking_payment_enabled',
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
  'debug_forward_to_admin',
  'max_debug_page_enabled',
  'dev_mode',
  'platform_user_merge_v2_enabled',
  'integrator_linked_phone_source',
  'important_fallback_delay_minutes',
  'integration_test_ids',
  'test_account_identifiers',
  'support_contact_url',
  'telegram_login_bot_username',
  'max_login_bot_nickname',
  'max_bot_api_key',
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
  'video_default_delivery',
  'video_presign_ttl_seconds',
  'video_watermark_enabled',
  'patient_booking_url',
  'booking_default_organization_id',
  'booking_calendar_show_working_hours',
  'booking_min_notice_hours',
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
  'patient_home_mood_icons',
  'notifications_topics',
  'smtp_outbound',
  'clinic_smtp_outbound',
  'clinic_smsc_api_key',
  'clinic_telegram_bot_token',
  'clinic_max_bot_api_key',
  'operator_health_imap',
  'web_push_vapid',
  'smsc_enabled',
  'smsc_api_key',
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
  'operator_health_projection_thresholds',
  'operator_heartbeat_config',
] as const;

const DOCTOR_SCOPE_KEYS = [
  'patient_label',
  'doctor_patient_support_comments_without_support_default_enabled',
  'doctor_patient_support_media_without_support_default_enabled',
  'doctor_specialist_task_reminder_channels',
  'doctor_today_preferences',
  'doctor_appointment_reminder_enabled',
  'doctor_appointment_reminder_offsets_minutes',
  'booking_calendar_default_window',
  'booking_calendar_default_branch_id',
  'booking_calendar_default_service_id',
] as const;

const PATCH_SCOPE_KEYS = [...ADMIN_SCOPE_KEYS, ...DOCTOR_SCOPE_KEYS] as const;

const patchSchema = z.object({
  key: z.enum(PATCH_SCOPE_KEYS),
  value: z.unknown(),
});
const deleteSchema = z.object({ key: z.literal('operator_health_probe_config') });

const batchBodySchema = z.object({
  items: z
    .array(
      z.object({
        key: z.enum(MODES_FORM_KEYS),
        value: z.unknown(),
      }),
    )
    .min(1),
});

// Список скалярных секретов живёт в одном месте — `modules/system-settings/auditRedaction`.
// Раньше он был здесь и закрывал только строку лога, а долговечный журнал изменений не закрывал
// никто: независимый аудит 28.07 нашёл `vk_id_client_secret` в `system_settings_audit` как есть.
// Два списка расходятся молча, поэтому список теперь один и общий с журналом.

/** Patient-home editorial controls are owner content controls, not ordinary clinic-management settings. */
const OWNER_ONLY_PATIENT_HOME_KEYS = new Set<string>([
  'patient_home_daily_practice_target',
  'patient_home_daily_warmup_rotation_enabled',
  'patient_home_daily_warmup_rotation_times',
  'patient_home_daily_warmup_repeat_cooldown_minutes',
  'patient_treatment_plan_item_done_repeat_cooldown_minutes',
]);

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
    mechanic: 'clinic_smtp' | 'clinic_sms' | 'clinic_telegram_bot' | 'clinic_max_bot';
    action: string;
  }
>([
  ['clinic_smtp_outbound', { mechanic: 'clinic_smtp', action: 'настроить собственный SMTP' }],
  ['clinic_smsc_api_key', { mechanic: 'clinic_sms', action: 'настроить собственный SMS-канал' }],
  [
    'clinic_telegram_bot_token',
    { mechanic: 'clinic_telegram_bot', action: 'настроить собственного Telegram-бота' },
  ],
  [
    'clinic_max_bot_api_key',
    { mechanic: 'clinic_max_bot', action: 'настроить собственного MAX-бота' },
  ],
]);

const CLINIC_DELIVERY_SETTING_INTEGRATIONS = new Map<string, PlatformIntegrationId>([
  ['clinic_smtp_outbound', 'email'],
  ['clinic_smsc_api_key', 'smsc'],
  ['clinic_telegram_bot_token', 'telegram'],
  ['clinic_max_bot_api_key', 'max'],
]);

async function isClinicDeliveryIntegrationEnabled(
  getSetting: ReturnType<typeof buildAppDeps>['systemSettings']['getSetting'],
  integration: PlatformIntegrationId,
): Promise<boolean> {
  try {
    const setting = await getSetting('platform_integration_availability', 'admin', {
      organizationId: null,
    });
    return parsePlatformIntegrationAvailabilityEnvelope(setting?.valueJson).integrations[integration];
  } catch {
    // An unreadable global switch is not permission to configure a tenant sender.
    return false;
  }
}

const PATIENT_HOME_TODAY_ENTITLEMENT_SETTING_KEYS = new Set([
  'patient_home_daily_practice_target',
  'patient_home_daily_warmup_rotation_enabled',
  'patient_home_daily_warmup_rotation_times',
  'patient_home_daily_warmup_repeat_cooldown_minutes',
  'patient_treatment_plan_item_done_repeat_cooldown_minutes',
  'patient_home_warmup_skip_to_next_available_enabled',
  'patient_home_mood_icons',
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

function redactWebPushVapidForAudit(envelope: unknown): unknown {
  if (envelope === null || typeof envelope !== 'object') return envelope;
  if (!('value' in envelope)) return envelope;
  const inner = (envelope as Record<string, unknown>).value;
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return envelope;
  const o = { ...(inner as Record<string, unknown>) };
  if ('privateKey' in o) {
    const p = typeof o.privateKey === 'string' ? o.privateKey.trim() : '';
    (o as Record<string, unknown>).privateKey = p.length > 0 ? '[REDACTED]' : '';
  }
  return { ...(envelope as Record<string, unknown>), value: o };
}

function auditValueForLog(key: string, value: unknown): unknown {
  if (isSecretValueSettingKey(key)) return '[REDACTED]';
  if (isPasswordBearingSettingKey(key)) return redactSettingValueForAudit(key, value);
  if (key === 'web_push_vapid') return redactWebPushVapidForAudit(value);
  if (key === 'booking_payment_providers') {
    const parsed = value;
    if (parsed !== null && typeof parsed === 'object' && 'value' in (parsed as object)) {
      const inner = (parsed as Record<string, unknown>).value;
      if (inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
        const o = { ...(inner as Record<string, unknown>) };
        if (Array.isArray(o.providers)) {
          o.providers = (o.providers as unknown[]).map((item) => {
            if (item === null || typeof item !== 'object') return item;
            const p = { ...(item as Record<string, unknown>) };
            if (typeof p.webhookSecret === 'string' && p.webhookSecret.trim())
              p.webhookSecret = '[REDACTED]';
            if (typeof p.apiKey === 'string' && p.apiKey.trim()) p.apiKey = '[REDACTED]';
            return p;
          });
        }
        return { value: o };
      }
    }
  }
  if (key === 'saas_billing_payment_provider') {
    return redactSaasBillingPaymentProviderValue(value);
  }
  return value;
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
        adminMode: session.adminMode,
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
  return NextResponse.json({ ok: true, settings });
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
      const batchParsed = batchBodySchema.safeParse(raw);
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
          oldValue: auditValueForLog(row.key, oldSetting?.valueJson ?? null),
          newValue: auditValueForLog(row.key, row.valueJson),
          updatedBy: session.user.userId,
          timestamp: new Date().toISOString(),
        });
      }
      try {
        const settings = redactAdminSettingsForClient(
          await deps.systemSettings.persistAdminModesBatch(norm.rows, session.user.userId, {
            organizationId,
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
    const entitlement = await requireEntitlementForMutation(
      gate.ctx.workspace,
      clinicDeliveryEntitlement.mechanic,
    );
    if (!entitlement.ok) {
      return entitlementMutationRefusalResponse(
        clinicDeliveryEntitlement.mechanic,
        clinicDeliveryEntitlement.action,
      );
    }
    const integration = CLINIC_DELIVERY_SETTING_INTEGRATIONS.get(parsed.data.key)!;
    if (!(await isClinicDeliveryIntegrationEnabled(deps.systemSettings.getSetting, integration))) {
      return NextResponse.json(
        { ok: false, error: 'integration_disabled', integration },
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

  const settingScope = settingScopeForKey(parsed.data.key);

  let normalizedValue = normalizeValueJson(parsed.data.value);

  if (parsed.data.key === 'patient_label') {
    const inner = normalizedValue.value;
    const label = typeof inner === 'string' ? inner.trim().toLowerCase() : '';
    if (label !== 'пациент' && label !== 'клиент') {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: label };
  }

  if (isModesFormKey(parsed.data.key)) {
    const checked = normalizeModesFormPatchItem(parsed.data.key, parsed.data.value);
    if (!checked.ok) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = checked.valueJson;
  }

  if (parsed.data.key === 'video_default_delivery') {
    const inner = normalizedValue.value;
    const raw = typeof inner === 'string' ? inner.trim().toLowerCase() : '';
    if (raw !== 'mp4' && raw !== 'hls' && raw !== 'auto') {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: raw };
  }

  if (parsed.data.key === 'booking_min_notice_hours') {
    const inner = normalizedValue.value;
    const n =
      typeof inner === 'number' && Number.isFinite(inner)
        ? inner
        : typeof inner === 'string' && /^\d+$/.test(inner.trim())
          ? Number.parseInt(inner.trim(), 10)
          : NaN;
    if (!Number.isFinite(n) || n < 0 || n > 168) {
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

  if (parsed.data.key === 'patient_home_mood_icons') {
    const inner = normalizedValue.value;
    if (!Array.isArray(inner) || inner.length !== 5) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    const scores = new Set<number>();
    const cleaned: { score: number; label: string; imageUrl: string | null }[] = [];
    for (const row of inner) {
      if (row === null || typeof row !== 'object') {
        return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
      }
      const o = row as Record<string, unknown>;
      const score =
        typeof o.score === 'number' && Number.isInteger(o.score) && o.score >= 1 && o.score <= 5
          ? o.score
          : null;
      if (score === null) {
        return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
      }
      if (scores.has(score)) {
        return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
      }
      scores.add(score);
      const label = typeof o.label === 'string' ? o.label.trim() : '';
      if (!label || label.length > 200) {
        return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
      }
      let imageUrl: string | null = null;
      if (o.imageUrl === null || o.imageUrl === undefined) {
        imageUrl = null;
      } else if (typeof o.imageUrl === 'string' && o.imageUrl.trim() === '') {
        imageUrl = null;
      } else if (typeof o.imageUrl === 'string' && o.imageUrl.startsWith('/api/media/')) {
        imageUrl = o.imageUrl.trim();
      } else {
        return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
      }
      cleaned.push({ score, label, imageUrl });
    }
    for (const s of [1, 2, 3, 4, 5]) {
      if (!scores.has(s)) {
        return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
      }
    }
    cleaned.sort((a, b) => a.score - b.score);
    normalizedValue = { value: cleaned };
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

  if (parsed.data.key === 'operator_health_projection_thresholds') {
    const inner = normalizedValue.value;
    const checked = normalizeOperatorHealthProjectionThresholdsForAdminPatch(inner);
    if (!checked.ok) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: checked.value };
  }

  if (parsed.data.key === 'smtp_outbound' || parsed.data.key === 'clinic_smtp_outbound') {
    const checked = parseSmtpOutboundPatchValue(normalizedValue);
    if (!checked.ok) {
      return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
    }
    normalizedValue = { value: checked.value };
  }

  /** Prefetch for audit: avoid second `getSetting` for `web_push_vapid` (same row as validation). */
  let webPushVapidOldRowForAudit: SystemSetting | null | undefined;
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
      : await deps.systemSettings.getSetting(parsed.data.key, settingScope, { organizationId });
  console.info('[admin-settings audit]', {
    key: parsed.data.key,
    oldValue: auditValueForLog(parsed.data.key, oldSetting?.valueJson ?? null),
    newValue: auditValueForLog(parsed.data.key, normalizedValue),
    updatedBy: session.user.userId,
    timestamp: new Date().toISOString(),
  });

  let setting: SystemSetting;
  try {
    setting = await deps.systemSettings.updateSetting(
      parsed.data.key,
      settingScope,
      normalizedValue,
      session.user.userId,
      { organizationId },
    );
  } catch (error) {
    const errResponse = systemSettingsOrgContextErrorResponse(error);
    if (errResponse) return errResponse;
    if (parsed.data.key === 'operator_health_probe_config' && error instanceof Error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    throw error;
  }

  const clientSetting = redactAdminSettingsForClient([setting])[0]!;
  return NextResponse.json({ ok: true, setting: clientSetting });
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
