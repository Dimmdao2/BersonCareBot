import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { membershipErrorResponse } from "@/app/api/booking-engine/patientPackagesRouteShared";
import { requireAdminBookingEngine } from "../../_requireAdminBookingEngine";

const patchSchema = z.object({
  notes: z.string().trim().max(2000).nullable(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }
  try {
    const pkg = await deps.memberships.updatePatientPackageNotes(
      id,
      gate.ctx.organizationId,
      parsed.data.notes,
    );
    return NextResponse.json({ ok: true, package: pkg });
  } catch (err) {
    return membershipErrorResponse(err);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }
  const detail = await deps.memberships.getPatientPackageDetail(id, gate.ctx.organizationId);
  if (!detail) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...detail });
}
