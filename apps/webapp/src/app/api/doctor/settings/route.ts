/**
 * GET  /api/doctor/settings — список настроек scope=doctor
 * PATCH /api/doctor/settings — обновить ключ scope=doctor
 * Guard: role === 'doctor' | 'admin'
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { systemSettingsOrgContextErrorResponse } from '@/app-layer/guards/systemSettingsOrgContextResponse';
import { ALLOWED_KEYS } from '@/modules/system-settings/types';

const DOCTOR_SCOPE_KEYS = [
  'doctor_patient_support_comments_without_support_default_enabled',
  'doctor_patient_support_media_without_support_default_enabled',
  'doctor_specialist_task_reminder_channels',
  'booking_calendar_default_window',
  'booking_calendar_default_branch_id',
  'booking_calendar_default_service_id',
  'booking_calendar_default_specialist_id',
] as const;

const SUPPORT_DEFAULT_KEYS = [
  'doctor_patient_support_comments_without_support_default_enabled',
  'doctor_patient_support_media_without_support_default_enabled',
] as const;

const patchSchema = z.object({
  key: z.enum(DOCTOR_SCOPE_KEYS),
  value: z.unknown(),
});

const supportDefaultsBatchSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            key: z.enum(SUPPORT_DEFAULT_KEYS),
            value: z.object({ value: z.boolean() }).strict(),
          })
          .strict(),
      )
      .length(SUPPORT_DEFAULT_KEYS.length),
  })
  .strict();

/**
 * Every key exposed here is PER-ORG. Platform-global `sms_fallback_enabled` deliberately has no
 * clinic route: a stale clinic payload is rejected before any row is written.
 */
export async function GET() {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const settings = await deps.systemSettings.listSettingsByScope('doctor', {
    organizationId: gate.ctx.organizationId,
  });
  return NextResponse.json({
    ok: true,
    settings: settings.filter((setting) =>
      (DOCTOR_SCOPE_KEYS as readonly string[]).includes(setting.key),
    ),
  });
}

export async function PATCH(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const raw = (await request.json().catch(() => null)) as unknown;
  if (raw !== null && typeof raw === 'object' && 'items' in raw) {
    const batch = supportDefaultsBatchSchema.safeParse(raw);
    if (!batch.success) {
      return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
    }
    const seen = new Set(batch.data.items.map((item) => item.key));
    if (SUPPORT_DEFAULT_KEYS.some((key) => !seen.has(key))) {
      return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
    }
    const deps = buildAppDeps();
    try {
      const settings = await deps.systemSettings.persistSettingsBatch(
        batch.data.items.map((item) => ({
          key: item.key,
          scope: 'doctor' as const,
          value: item.value,
        })),
        gate.ctx.session.user.userId,
        { organizationId: gate.ctx.organizationId },
      );
      return NextResponse.json({ ok: true, settings });
    } catch (error) {
      const errResponse = systemSettingsOrgContextErrorResponse(error);
      if (errResponse) return errResponse;
      console.error('[doctor-settings] atomic batch failed', {
        operation: 'support-defaults',
        errorClass: error instanceof Error ? error.name : 'unknown',
      });
      return NextResponse.json(
        { ok: false, error: 'settings_write_unavailable' },
        { status: 503 },
      );
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

  const deps = buildAppDeps();
  try {
    const setting = await deps.systemSettings.updateSetting(
      parsed.data.key,
      'doctor',
      parsed.data.value,
      gate.ctx.session.user.userId,
      { organizationId: gate.ctx.organizationId },
    );
    return NextResponse.json({ ok: true, setting });
  } catch (error) {
    const errResponse = systemSettingsOrgContextErrorResponse(error);
    if (errResponse) return errResponse;
    console.error('[doctor-settings] mutation failed', {
      operation: parsed.data.key,
      errorClass: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { ok: false, error: 'settings_write_unavailable' },
      { status: 503 },
    );
  }
}
