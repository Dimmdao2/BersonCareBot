import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireAdminBookingEngine } from '../_requireAdminBookingEngine';

const PutSchema = z.object({
  specialistId: z.string().uuid().nullable().optional(),
  bufferMinutes: z.number().int().min(0).max(240).optional(),
  minNoticeHours: z.number().int().min(0).max(168).optional(),
  maxConsecutiveSlotHours: z.number().int().min(1).max(24).optional(),
});

function parseMinNoticeHours(valueJson: unknown): number {
  const inner =
    valueJson !== null &&
    typeof valueJson === 'object' &&
    'value' in (valueJson as Record<string, unknown>)
      ? (valueJson as { value: unknown }).value
      : valueJson;
  const n =
    typeof inner === 'number' && Number.isFinite(inner)
      ? inner
      : typeof inner === 'string' && /^\d+$/.test(inner.trim())
        ? Number.parseInt(inner.trim(), 10)
        : 0;
  return Math.max(0, Math.min(168, Math.round(n)));
}

export async function GET(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json(
      { ok: false, error: 'booking_scheduling_unavailable' },
      { status: 503 },
    );
  }
  const url = new URL(request.url);
  const specialistId = url.searchParams.get('specialistId');
  const [bufferMinutes, minNoticeRow, maxConsecutiveRow] = await Promise.all([
    deps.bookingScheduling.getBufferMinutes(
      gate.ctx.organizationId,
      specialistId && specialistId !== '__none__' ? specialistId : null,
    ),
    deps.systemSettings.getSetting('booking_min_notice_hours', 'admin', {
      organizationId: gate.ctx.organizationId,
    }),
    deps.systemSettings.getSetting('booking_max_consecutive_slot_hours', 'admin', {
      organizationId: gate.ctx.organizationId,
    }),
  ]);
  return NextResponse.json({
    ok: true,
    bufferMinutes,
    minNoticeHours: parseMinNoticeHours(minNoticeRow?.valueJson ?? null),
    maxConsecutiveSlotHours: Math.max(
      1,
      parseMinNoticeHours(maxConsecutiveRow?.valueJson ?? null) || 3,
    ),
  });
}

export async function PUT(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'booking');
  if (!entitlement.ok) return entitlement.response;
  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.bookingScheduling) {
    return NextResponse.json(
      { ok: false, error: 'booking_scheduling_unavailable' },
      { status: 503 },
    );
  }
  const bookingScheduling = deps.bookingScheduling;
  if (parsed.data.bufferMinutes != null) {
    const bufferMinutes = parsed.data.bufferMinutes;
    await withDoctorWorkspacePrincipal(
      gate.ctx,
      'admin.booking-engine.scheduling-settings.buffer-minutes',
      () =>
        bookingScheduling.upsertBufferMinutes({
          organizationId: gate.ctx.organizationId,
          specialistId: parsed.data.specialistId ?? null,
          minutes: bufferMinutes,
        }),
    );
  }
  if (parsed.data.minNoticeHours != null) {
    await deps.systemSettings.updateSetting(
      'booking_min_notice_hours',
      'admin',
      { value: parsed.data.minNoticeHours },
      gate.ctx.session.user.userId,
      { organizationId: gate.ctx.organizationId },
    );
  }
  if (parsed.data.maxConsecutiveSlotHours != null) {
    await deps.systemSettings.updateSetting(
      'booking_max_consecutive_slot_hours',
      'admin',
      { value: parsed.data.maxConsecutiveSlotHours },
      gate.ctx.session.user.userId,
      { organizationId: gate.ctx.organizationId },
    );
  }
  const bufferMinutes = await bookingScheduling.getBufferMinutes(
    gate.ctx.organizationId,
    parsed.data.specialistId ?? null,
  );
  const [minNoticeRow, maxConsecutiveRow] = await Promise.all([
    deps.systemSettings.getSetting('booking_min_notice_hours', 'admin', {
      organizationId: gate.ctx.organizationId,
    }),
    deps.systemSettings.getSetting('booking_max_consecutive_slot_hours', 'admin', {
      organizationId: gate.ctx.organizationId,
    }),
  ]);
  return NextResponse.json({
    ok: true,
    bufferMinutes,
    minNoticeHours: parseMinNoticeHours(minNoticeRow?.valueJson ?? null),
    maxConsecutiveSlotHours: Math.max(
      1,
      parseMinNoticeHours(maxConsecutiveRow?.valueJson ?? null) || 3,
    ),
  });
}
