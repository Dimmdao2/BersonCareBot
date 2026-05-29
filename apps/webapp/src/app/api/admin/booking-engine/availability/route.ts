import { NextResponse } from "next/server";
import { z } from "zod";
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
    const row = await gate.ctx.service.services.upsertServiceLocationAvailability({
      organizationId: gate.ctx.organizationId,
      serviceId: parsed.data.serviceId,
      branchId: parsed.data.branchId,
      isActive: parsed.data.isActive,
    });
    return NextResponse.json({ ok: true, locationAvailability: row });
  }
  const row = await gate.ctx.service.services.upsertSpecialistServiceAvailability({
    organizationId: gate.ctx.organizationId,
    specialistId: parsed.data.specialistId,
    serviceId: parsed.data.serviceId,
    branchId: parsed.data.branchId ?? null,
    roomId: parsed.data.roomId ?? null,
    cityCode: parsed.data.cityCode ?? null,
    durationMinutesOverride: parsed.data.durationMinutesOverride ?? null,
    priceMinorOverride: parsed.data.priceMinorOverride ?? null,
    isActive: parsed.data.isActive,
    sortOrder: parsed.data.sortOrder,
  });
  return NextResponse.json({ ok: true, specialistAvailability: row });
}
