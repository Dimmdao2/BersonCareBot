import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireClinicManagementBookingEngine } from '../_requireClinicManagementBookingEngine';

const PutSchema = z
  .object({
    isActive: z.boolean(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .transform((value) => value.toUpperCase())
      .optional(),
  })
  .strict();

export async function PUT(request: Request) {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'booking');
  if (!entitlement.ok) return entitlement.response;

  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const location = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'admin.booking-engine.online-location.set-state',
    () =>
      gate.ctx.service.catalog.setOnlineLocationState({
        organizationId: gate.ctx.organizationId,
        isActive: parsed.data.isActive,
        ...(parsed.data.color ? { colorOverride: parsed.data.color } : {}),
      }),
  );
  return NextResponse.json({ ok: true, location });
}
