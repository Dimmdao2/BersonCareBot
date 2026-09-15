import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { systemSettingsOrgContextErrorResponse } from '@/app-layer/guards/systemSettingsOrgContextResponse';
import {
  MAX_APPOINTMENT_REMINDERS,
  parseAppointmentReminderSettings,
} from '@/modules/booking-notifications/appointmentReminderSchedule';

const offsetsSchema = z
  .array(z.number().int().positive())
  .max(MAX_APPOINTMENT_REMINDERS)
  .refine((offsets) => new Set(offsets).size === offsets.length);

const bodySchema = z.object({ offsetsMinutes: offsetsSchema }).strict();

export async function GET() {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const row = await buildAppDeps().systemSettings.getSetting(
    'doctor_appointment_reminder_offsets_minutes',
    'doctor',
    { organizationId: gate.ctx.organizationId },
  );
  return NextResponse.json({
    ok: true,
    settings: parseAppointmentReminderSettings(row?.valueJson),
  });
}

export async function PATCH(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
  }
  const deps = buildAppDeps();
  try {
    const setting = await deps.systemSettings.updateSetting(
      'doctor_appointment_reminder_offsets_minutes',
      'doctor',
      parsed.data.offsetsMinutes,
      gate.ctx.session.user.userId,
      { organizationId: gate.ctx.organizationId },
    );
    return NextResponse.json({
      ok: true,
      settings: parseAppointmentReminderSettings(setting.valueJson),
    });
  } catch (error) {
    const response = systemSettingsOrgContextErrorResponse(error);
    if (response) return response;
    console.error('[appointment-reminders] mutation failed', {
      errorClass: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ ok: false, error: 'settings_write_unavailable' }, { status: 503 });
  }
}
