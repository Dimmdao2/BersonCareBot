import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { getCurrentSession } from "@/modules/auth/service";
import type { BookingCatalogPort } from "@/modules/booking-catalog/ports";

export type AdminBookingCatalogContext = {
  session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>;
  port: BookingCatalogPort;
  organizationId: string;
};

export async function requireAdminBookingCatalog(): Promise<
  | { ok: true; ctx: AdminBookingCatalogContext }
  | { ok: false; response: NextResponse }
> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    };
  }
  if (session.user.role !== "admin" || !session.adminMode) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }
  const workspaceGate = await requireDoctorWorkspaceApiContext();
  if (!workspaceGate.ok) return workspaceGate;
  const port = buildAppDeps().bookingCatalogPort;
  if (!port) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 }),
    };
  }
  return {
    ok: true,
    ctx: {
      session,
      port,
      organizationId: workspaceGate.ctx.organizationId,
    },
  };
}

export function withAdminBookingCatalogPrincipal<T>(
  ctx: Pick<AdminBookingCatalogContext, "organizationId">,
  fn: () => T,
): T {
  return withDoctorWorkspacePrincipal(ctx, fn);
}
