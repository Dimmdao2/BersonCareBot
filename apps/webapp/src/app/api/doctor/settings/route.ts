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
  'sms_fallback_enabled',
  'doctor_patient_support_comments_without_support_default_enabled',
  'doctor_patient_support_media_without_support_default_enabled',
  'doctor_specialist_task_reminder_channels',
  'booking_calendar_default_window',
  'booking_calendar_default_branch_id',
  'booking_calendar_default_service_id',
  'booking_calendar_default_specialist_id',
] as const;

const patchSchema = z.object({
  key: z.enum(DOCTOR_SCOPE_KEYS),
  value: z.unknown(),
});

/**
 * P0.11.3: every DOCTOR_SCOPE_KEYS key except `sms_fallback_enabled` is PER-ORG (see `orgScopedKeys.ts`)
 * — this route always threads the caller's own clinic `organizationId`; the `system-settings` service
 * chokepoint forces GLOBAL keys back to `organization_id IS NULL` regardless, so it is always safe to
 * pass it through here without per-key branching.
 */
export async function GET() {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const settings = await deps.systemSettings.listSettingsByScope('doctor', {
    organizationId: gate.ctx.organizationId,
  });
  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const raw = (await request.json().catch(() => null)) as unknown;
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
    throw error;
  }
}
