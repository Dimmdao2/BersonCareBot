import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import type { BookingCatalogPort } from "@/modules/booking-catalog/ports";

export type AdminBookingCatalogContext = {
  session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>;
  port: BookingCatalogPort;
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
  const port = buildAppDeps().bookingCatalogPort;
  if (!port) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "catalog_unavailable" }, { status: 503 }),
    };
  }
  return { ok: true, ctx: { session, port } };
}
