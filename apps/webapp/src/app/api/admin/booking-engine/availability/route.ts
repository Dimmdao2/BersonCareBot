import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { requireClinicManagementBookingEngine } from '../_requireClinicManagementBookingEngine';

/**
 * Пара «специалист × услуга × филиал» — единственная связь, которой описывается «услугу кто-то
 * делает» (#1102 §3.1). Прежние `service_location` и `solo_service_location` писали ещё и
 * `be_service_location_availability` — таблицу без специалиста, снесённую решением владельца
 * 11.09; оба варианта были параметрами этой же записи, а не отдельными действиями (§5), поэтому
 * дискриминированного объединения здесь больше нет.
 */
const PostSchema = z.object({
  kind: z.literal('specialist_service'),
  specialistId: z.string().uuid(),
  serviceId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  cityCode: z.string().max(80).nullable().optional(),
  priceMinorOverride: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export async function GET() {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const specialistAvailability = await gate.ctx.service.services.listSpecialistServiceAvailability(
    gate.ctx.organizationId,
  );
  return NextResponse.json({ ok: true, specialistAvailability });
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
  const service = await gate.ctx.service.services.getService(parsed.data.serviceId);
  if (!service || service.organizationId !== gate.ctx.organizationId) {
    return NextResponse.json({ ok: false, error: 'service_not_found' }, { status: 404 });
  }
  const data = parsed.data;
  const [specialist, branch, room] = await Promise.all([
    gate.ctx.service.catalog.getSpecialist(data.specialistId),
    data.branchId ? gate.ctx.service.catalog.getBranch(data.branchId) : null,
    data.roomId ? gate.ctx.service.catalog.getRoom(data.roomId) : null,
  ]);
  if (!specialist || specialist.organizationId !== gate.ctx.organizationId) {
    return NextResponse.json({ ok: false, error: 'specialist_not_found' }, { status: 404 });
  }
  if (data.branchId && (!branch || branch.organizationId !== gate.ctx.organizationId)) {
    return NextResponse.json({ ok: false, error: 'branch_not_found' }, { status: 404 });
  }
  if (data.roomId && (!room || room.organizationId !== gate.ctx.organizationId)) {
    return NextResponse.json({ ok: false, error: 'room_not_found' }, { status: 404 });
  }
  const row = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'admin.booking-engine.availability.specialist-service.upsert',
    () =>
      gate.ctx.service.services.upsertSpecialistServiceAvailability({
        organizationId: gate.ctx.organizationId,
        specialistId: data.specialistId,
        serviceId: data.serviceId,
        branchId: data.branchId ?? null,
        roomId: data.roomId ?? null,
        cityCode: data.cityCode ?? null,
        priceMinorOverride: data.priceMinorOverride ?? null,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      }),
  );
  return NextResponse.json({ ok: true, specialistAvailability: row });
}
