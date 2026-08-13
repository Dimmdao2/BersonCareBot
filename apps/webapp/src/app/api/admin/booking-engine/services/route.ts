import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { requireClinicManagementBookingEngine } from '../_requireClinicManagementBookingEngine';

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  durationMinutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  bufferAfterMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .refine((n) => n % 5 === 0)
    .optional()
    .default(0),
  priceMinor: z.number().int().min(0),
  isActive: z.boolean().optional().default(true),
  prepaymentApplicable: z.boolean().optional().default(false),
  usableInPackages: z.boolean().optional().default(true),
  onlinePaymentApplicable: z.boolean().optional().default(false),
  publicWidgetVisible: z.boolean().optional().default(true),
  adminManualOnly: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
});

export async function GET() {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const services = await gate.ctx.service.services.listServices(gate.ctx.organizationId);
  return NextResponse.json({ ok: true, services });
}

export async function POST(request: Request) {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'booking');
  if (!entitlement.ok) return entitlement.response;
  const body = await request.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  const service = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'admin.booking-engine.services.upsert',
    () =>
      gate.ctx.service.services.upsertService({
        organizationId: gate.ctx.organizationId,
        title: parsed.data.title.trim(),
        description: parsed.data.description ?? null,
        durationMinutes: parsed.data.durationMinutes,
        bufferAfterMinutes: parsed.data.bufferAfterMinutes,
        priceMinor: parsed.data.priceMinor,
        isActive: parsed.data.isActive,
        prepaymentApplicable: parsed.data.prepaymentApplicable,
        usableInPackages: parsed.data.usableInPackages,
        onlinePaymentApplicable: parsed.data.onlinePaymentApplicable,
        publicWidgetVisible: parsed.data.publicWidgetVisible,
        adminManualOnly: parsed.data.adminManualOnly,
        sortOrder: parsed.data.sortOrder,
      }),
  );
  return NextResponse.json({ ok: true, service });
}
