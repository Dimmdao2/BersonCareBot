import { NextResponse } from "next/server";
import { z } from "zod";
import { withDoctorWorkspacePrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const SpecialistSchema = z.object({
  kind: z.literal("specialist_service"),
  specialistId: z.string().uuid(),
  serviceId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  cityCode: z.string().max(80).nullable().optional(),
  durationMinutesOverride: z.number().int().min(1).nullable().optional(),
  priceMinorOverride: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

const LocationSchema = z.object({
  kind: z.literal("service_location"),
  serviceId: z.string().uuid(),
  branchId: z.string().uuid(),
  isActive: z.boolean().optional().default(true),
});

const PostSchema = z.discriminatedUnion("kind", [SpecialistSchema, LocationSchema]);

export async function GET() {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const [specialistAvailability, locationAvailability] = await Promise.all([
    gate.ctx.service.services.listSpecialistServiceAvailability(gate.ctx.organizationId),
    gate.ctx.service.services.listServiceLocationAvailability(gate.ctx.organizationId),
  ]);
  return NextResponse.json({ ok: true, specialistAvailability, locationAvailability });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const body = await request.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  if (parsed.data.kind === "service_location") {
    const data = parsed.data;
    const row = await withDoctorWorkspacePrincipal(
      gate.ctx,
      "admin.booking-engine.availability.service-location.upsert",
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
  const row = await withDoctorWorkspacePrincipal(
    gate.ctx,
    "admin.booking-engine.availability.specialist-service.upsert",
    () =>
      gate.ctx.service.services.upsertSpecialistServiceAvailability({
        organizationId: gate.ctx.organizationId,
        specialistId: data.specialistId,
        serviceId: data.serviceId,
        branchId: data.branchId ?? null,
        roomId: data.roomId ?? null,
        cityCode: data.cityCode ?? null,
        durationMinutesOverride: data.durationMinutesOverride ?? null,
        priceMinorOverride: data.priceMinorOverride ?? null,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      }),
  );
  return NextResponse.json({ ok: true, specialistAvailability: row });
}
