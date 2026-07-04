import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../../../_requireAdminBookingEngine";

type RouteContext = { params: Promise<{ id: string }> };

// ST-02 admin mirror of the doctor «Пересчитать» endpoint (mirrors consume/route.ts pairing).
export async function POST(_request: Request, context: RouteContext) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { id: patientPackageId } = await context.params;
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }
  try {
    // IDOR/ownership (OQ-1): organizationId from the gate scopes the package lookup in the service.
    const summary = await deps.memberships.recalcPastSessionsForPackage({
      organizationId: gate.ctx.organizationId,
      patientPackageId,
      createdByPlatformUserId: gate.ctx.session.user.userId,
    });
    return NextResponse.json({
      ok: true,
      summary: {
        debited: summary.debited.length,
        skipped: summary.skipped.length,
        outOfBalance: summary.outOfBalance.length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "recalc_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
