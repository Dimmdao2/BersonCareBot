import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import {
  requireClinicManagementApiContext,
} from "@/app-layer/guards/requireRole";
import { getCurrentSession } from "@/modules/auth/service";
import type { BookingCatalogPort } from "@/modules/booking-catalog/ports";
import { isLegacyRubitimeOrganization } from "@/modules/booking-engine/legacyRubitimeOrganization";

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

  // U9 owns true global catalog governance and its sanctioned platform DB principal.
  // Until that contract exists, platform operations must not borrow a clinic membership
  // or use a bootstrap principal to mutate the unscoped legacy catalog.
  return { ok: false, response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
}

/**
 * Legacy Rubitime catalog reads are needed to configure an organization-scoped mapping.
 * Mutations remain fail-closed behind `requireAdminBookingCatalog` until U9 provides
 * sanctioned global catalog governance and a platform DB principal.
 */
export async function requireClinicManagementBookingCatalogRead(): Promise<
  | { ok: true; ctx: AdminBookingCatalogContext }
  | { ok: false; response: NextResponse }
> {
  const workspaceGate = await requireClinicManagementApiContext();
  if (!workspaceGate.ok) return workspaceGate;
  if (!isLegacyRubitimeOrganization(workspaceGate.ctx.organizationId)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    };
  }
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
      session: workspaceGate.ctx.session,
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
