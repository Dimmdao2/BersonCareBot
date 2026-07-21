import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/app-layer/logging/logger";
import { withExplicitOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import {
  InPersonBookingResolveError,
  resolveInPersonBookingContext,
  resolveSlugBoundPublicInPersonBookingOrganization,
} from "@/modules/patient-booking/inPersonBookingResolve";
import { inPersonSlotsQuerySchema } from "@/modules/patient-booking/inPersonApiSchemas";

const onlineQuery = z.object({
  type: z.literal("online"),
  category: z.enum(["rehab_lfk", "nutrition", "general"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  slotCount: z.coerce.number().int().min(1).max(8).optional(),
});

const querySchema = z.discriminatedUnion("type", [onlineQuery, inPersonSlotsQuerySchema]);

export async function GET(request: Request) {
  stampBootstrapPrincipal("api/booking/public/slots:GET", request);
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    type: url.searchParams.get("type") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    orgSlug: url.searchParams.get("orgSlug") ?? undefined,
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
    if (parsed.data.type === "online") {
      return NextResponse.json({ ok: false, error: "ambiguous_booking_tenant" }, { status: 400 });
    }
    const publicContext = await resolveSlugBoundPublicInPersonBookingOrganization(deps, parsed.data);
    const slots = await withExplicitOrganizationPrincipal(
      { organizationId: publicContext.organizationId, source: "api/booking/public/slots:GET" },
      async () => {
        const ctx = await resolveInPersonBookingContext(deps, publicContext.keys);
        if (ctx.organizationId !== publicContext.organizationId) {
          throw new InPersonBookingResolveError("ambiguous_booking_tenant");
        }
        return deps.patientBooking.getSlots({
          type: "in_person",
          organizationId: ctx.organizationId,
          branchServiceId: ctx.branchServiceId,
          date: parsed.data.date,
          slotCount: parsed.data.slotCount,
        });
      },
    );
    return NextResponse.json({ ok: true, slots }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "slots_unavailable";
    if (err instanceof InPersonBookingResolveError) {
      const status = msg === "branch_service_mapping_missing" ? 404 : 400;
      return NextResponse.json({ ok: false, error: msg }, { status });
    }
    if (msg === "branch_service_not_found") {
      return NextResponse.json({ ok: false, error: msg }, { status: 404 });
    }
    logger.error({ err }, "[booking/public/slots] failed");
    return NextResponse.json({ ok: false, error: msg }, { status: 503 });
  }
}
