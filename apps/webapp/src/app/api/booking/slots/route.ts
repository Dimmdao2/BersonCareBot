import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { logger } from "@/app-layer/logging/logger";
import { InPersonBookingResolveError, resolveInPersonBranchServiceId } from "@/modules/patient-booking/inPersonBookingResolve";
import { inPersonSlotsQuerySchema } from "@/modules/patient-booking/inPersonApiSchemas";

const slotCountSchema = z.coerce.number().int().min(1).max(8).optional();

const onlineQuery = z.object({
  type: z.literal("online"),
  category: z.enum(["rehab_lfk", "nutrition", "general"]),
  city: z.string().trim().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  slotCount: slotCountSchema,
});

const querySchema = z.discriminatedUnion("type", [onlineQuery, inPersonSlotsQuerySchema]);

export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    type: url.searchParams.get("type") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    city: url.searchParams.get("city") ?? undefined,
    branchServiceId: url.searchParams.get("branchServiceId") ?? undefined,
    branchId: url.searchParams.get("branchId") ?? undefined,
    serviceId: url.searchParams.get("serviceId") ?? undefined,
    date: url.searchParams.get("date") ?? undefined,
    slotCount: url.searchParams.get("slotCount") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const slots =
      parsed.data.type === "online"
        ? await deps.patientBooking.getSlots(parsed.data)
        : await deps.patientBooking.getSlots({
            type: "in_person",
            branchServiceId: await resolveInPersonBranchServiceId(deps, parsed.data),
            date: parsed.data.date,
            slotCount: parsed.data.slotCount,
          });
    return NextResponse.json({ ok: true, slots }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "slots_unavailable";
    if (err instanceof InPersonBookingResolveError) {
      const status = msg === "branch_service_mapping_missing" ? 404 : 400;
      return NextResponse.json({ ok: false, error: msg }, { status });
    }
    if (msg === "branch_service_not_found") {
      return NextResponse.json({ ok: false, error: "branch_service_not_found" }, { status: 404 });
    }
    if (msg === "catalog_unavailable") {
      return NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 });
    }
    logger.error({ err }, "[booking/slots] getSlots failed");
    return NextResponse.json({ ok: false, error: "slots_unavailable" }, { status: 503 });
  }
}
