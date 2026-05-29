import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorBookingEngine } from "../_requireDoctorBookingEngine";

const querySchema = z.object({
  platformUserId: z.string().uuid(),
});

export async function GET(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ platformUserId: url.searchParams.get("platformUserId") });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.products) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }
  const purchases = await deps.products.listPatientProductsForStaff(
    parsed.data.platformUserId,
    gate.ctx.organizationId,
  );
  return NextResponse.json({ ok: true, purchases });
}
