import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { requireClinicManagementBookingEngine } from '../_requireClinicManagementBookingEngine';

const SpecialistSchema = z.object({
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

const LocationSchema = z.object({
  kind: z.literal('service_location'),
  serviceId: z.string().uuid(),
  branchId: z.string().uuid(),
  isActive: z.boolean().optional().default(true),
});

const SoloLocationSchema = z.object({
  kind: z.literal('solo_service_location'),
  specialistId: z.string().uuid(),
  serviceId: z.string().uuid(),
  branchId: z.string().uuid(),
  isActive: z.boolean().optional().default(true),
});

const PostSchema = z.discriminatedUnion('kind', [
  SpecialistSchema,
  LocationSchema,
  SoloLocationSchema,
]);

export async function GET() {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const [specialistAvailability, locationAvailability] = await Promise.all([
    gate.ctx.service.services.listSpecialistServiceAvailability(gate.ctx.organizationId),
    gate.ctx.service.services.listServiceLocationAvailability(gate.ctx.organizationId),
  ]);
  return NextResponse.json({ ok: true, specialistAvailability, locationAvailability });
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
  if (parsed.data.kind === 'solo_service_location') {
    const data = parsed.data;
    try {
      const result = await withDoctorWorkspacePrincipal(
        gate.ctx,
        'admin.booking-engine.availability.solo-service-location.set',
        async () => {
          const [service, branch, specialist] = await Promise.all([
            gate.ctx.service.services.getService(data.serviceId),
            gate.ctx.service.catalog.getBranch(data.branchId),
            gate.ctx.service.catalog.getSpecialist(data.specialistId),
          ]);
          if (!service || service.organizationId !== gate.ctx.organizationId) {
            throw new Error('service_not_found');
          }
          if (!branch || branch.organizationId !== gate.ctx.organizationId) {
            throw new Error('branch_not_found');
          }
          if (!specialist || specialist.organizationId !== gate.ctx.organizationId) {
            throw new Error('specialist_not_found');
          }
          return gate.ctx.service.services.setSoloServiceLocationAvailability({
            organizationId: gate.ctx.organizationId,
            specialistId: data.specialistId,
            serviceId: data.serviceId,
            branchId: data.branchId,
            isActive: data.isActive,
          });
        },
      );
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (
        code === 'service_not_found' ||
        code === 'branch_not_found' ||
        code === 'specialist_not_found'
      ) {
        return NextResponse.json({ ok: false, error: code }, { status: 404 });
      }
      throw error;
    }
  }
  const service = await gate.ctx.service.services.getService(parsed.data.serviceId);
  if (!service || service.organizationId !== gate.ctx.organizationId) {
    return NextResponse.json({ ok: false, error: 'service_not_found' }, { status: 404 });
  }
  if (parsed.data.kind === 'service_location') {
    const data = parsed.data;
    const branch = await gate.ctx.service.catalog.getBranch(data.branchId);
    if (!branch || branch.organizationId !== gate.ctx.organizationId) {
      return NextResponse.json({ ok: false, error: 'branch_not_found' }, { status: 404 });
    }
    const row = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'admin.booking-engine.availability.service-location.upsert',
      () =>
        gate.ctx.service.services.upsertServiceLocationAvailability({
          organizationId: gate.ctx.organizationId,
          serviceId: data.serviceId,
          branchId: data.branchId,
          isActive: data.isActive,
        }),
    );
    return NextResponse.json({ ok: true, locationAvailability: row });
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
