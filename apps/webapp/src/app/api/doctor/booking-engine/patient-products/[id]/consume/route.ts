import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorBookingEngine } from "../../../_requireDoctorBookingEngine";

const bodySchema = z.object({
  platformUserId: z.string().uuid(),
  serviceId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const { id: productPurchaseId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.products) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }
  try {
    await deps.products.manualConsumeVisitForStaff({
      organizationId: gate.ctx.organizationId,
      productPurchaseId,
      platformUserId: parsed.data.platformUserId,
      serviceId: parsed.data.serviceId,
      appointmentId: parsed.data.appointmentId ?? null,
      actorPlatformUserId: gate.ctx.session.user.userId,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "consume_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
