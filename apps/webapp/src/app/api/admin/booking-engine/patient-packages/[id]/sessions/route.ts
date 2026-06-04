import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { membershipErrorResponse } from "@/app/api/booking-engine/patientPackagesRouteShared";
import { requireAdminBookingEngine } from "../../../_requireAdminBookingEngine";

type RouteContext = { params: Promise<{ id: string }> };

function parseAllowPastUnlink(valueJson: unknown): boolean {
  if (valueJson === true) return true;
  if (valueJson && typeof valueJson === "object" && "value" in valueJson) {
    return (valueJson as { value?: unknown }).value === true;
  }
  return false;
}

export async function GET(request: Request, context: RouteContext) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const includePast = new URL(request.url).searchParams.get("includePast") === "true";
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }
  try {
    const setting = await deps.systemSettings?.getSetting(
      "booking_allow_doctor_unlink_past_package_sessions",
      "admin",
    );
    const allowPastUnlink = parseAllowPastUnlink(setting?.valueJson ?? null);
    const sessions = await deps.memberships.listPatientPackageSessions(id, gate.ctx.organizationId, {
      includePast,
      allowPastUnlink,
    });
    return NextResponse.json({ ok: true, sessions });
  } catch (err) {
    return membershipErrorResponse(err);
  }
}
