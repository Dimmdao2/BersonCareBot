import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../../../_requireAdminBookingEngine";

type RouteContext = { params: Promise<{ id: string }> };

// ST-02 admin mirror of the doctor «Пересчитать» endpoint.
// Returns the full summary object (same contract as the doctor route) so admin UI has
// the same payload shape. IDOR/ownership scoped by organizationId from the gate.
export async function POST(_request: Request, context: RouteContext) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { id: patientPackageId } = await context.params;
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }
  try {
    const summary = await deps.memberships.recalcPastSessionsForPackage({
      organizationId: gate.ctx.organizationId,
      patientPackageId,
      createdByPlatformUserId: gate.ctx.session.user.userId,
    });
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "recalc_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
