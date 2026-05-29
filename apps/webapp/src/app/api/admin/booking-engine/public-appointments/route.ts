import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { beAppointments } from "../../../../../../db/schema/bookingEngine";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

export async function GET(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "20") || 20));

  const db = getDrizzle();
  const rows = await db
    .select({
      id: beAppointments.id,
      startAt: beAppointments.startAt,
      phoneNormalized: beAppointments.phoneNormalized,
      attributionJson: beAppointments.attributionJson,
      createdAt: beAppointments.createdAt,
    })
    .from(beAppointments)
    .where(
      and(
        eq(beAppointments.organizationId, gate.ctx.organizationId),
        eq(beAppointments.source, "public_widget"),
      ),
    )
    .orderBy(desc(beAppointments.createdAt))
    .limit(limit);

  const items = rows
    .filter((r) => {
      const a = r.attributionJson as Record<string, unknown> | null;
      return a != null && Object.keys(a).length > 0;
    })
    .map((r) => ({
      id: r.id,
      startAt: r.startAt,
      phoneNormalized: r.phoneNormalized,
      attribution: r.attributionJson as Record<string, unknown>,
      createdAt: r.createdAt,
    }));

  return NextResponse.json({ ok: true, items });
}
