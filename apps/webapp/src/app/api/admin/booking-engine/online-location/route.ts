import { NextResponse } from "next/server";
import { z } from "zod";
import { requireEntitlement } from "@/app-layer/guards/requireEntitlement";
import { withDoctorWorkspacePrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { setBuiltInOnlineLocationState } from "@/modules/booking-engine/onlineLocation";
import { requireClinicManagementBookingEngine } from "../_requireAdminBookingEngine";

const PutSchema = z.object({ isActive: z.boolean() }).strict();

export async function PUT(request: Request) {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlement(gate.ctx, "booking");
  if (!entitlement.ok) return entitlement.response;

  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const location = await withDoctorWorkspacePrincipal(
    gate.ctx,
    "admin.booking-engine.online-location.set-state",
    () =>
      setBuiltInOnlineLocationState(gate.ctx.service.catalog, {
        organizationId: gate.ctx.organizationId,
        isActive: parsed.data.isActive,
      }),
  );
  return NextResponse.json({ ok: true, location });
}
