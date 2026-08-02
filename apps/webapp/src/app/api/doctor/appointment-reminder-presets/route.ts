import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { normalizeAppointmentReminderSettings } from '@/modules/booking-notifications/appointmentReminderPresets';

const bodySchema = z.object({
  allowedPresetIds: z.array(z.string()),
  defaultPresetId: z.string().nullable(),
});

async function ownSpecialistContext() {
  const workspace = await requireDoctorWorkspaceContext();
  if (!workspace.specialistId) return null;
  return workspace;
}

export async function GET() {
  const workspace = await ownSpecialistContext();
  if (!workspace) return NextResponse.json({ ok: false, error: 'specialist_required' }, { status: 403 });
  const settings = await buildAppDeps().bookingEngine?.getSpecialistAppointmentReminderSettings({
    organizationId: workspace.organizationId,
    specialistId: workspace.specialistId,
  });
  if (!settings) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(request: Request) {
  const workspace = await ownSpecialistContext();
  if (!workspace) return NextResponse.json({ ok: false, error: 'specialist_required' }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
  const settings = normalizeAppointmentReminderSettings(parsed.data);
  if (
    settings.allowedPresetIds.length !== new Set(parsed.data.allowedPresetIds).size ||
    (parsed.data.defaultPresetId !== null && settings.defaultPresetId !== parsed.data.defaultPresetId)
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_value' }, { status: 400 });
  }
  const updated = await buildAppDeps().bookingEngine?.updateSpecialistAppointmentReminderSettings({
    organizationId: workspace.organizationId,
    specialistId: workspace.specialistId,
    settings,
  });
  if (!updated) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, settings });
}
