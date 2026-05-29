import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../../../_requireAdminBookingEngine";

const bodySchema = z.object({
  expiresAt: z.string().datetime().nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.products) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }
  try {
    const link = await deps.products.createPayLink({
      organizationId: gate.ctx.organizationId,
      productId: id,
      expiresAt: parsed.data.expiresAt ?? null,
      maxUses: parsed.data.maxUses ?? null,
    });
    return NextResponse.json({ ok: true, link, payUrl: `/book/product/${link.token}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "pay_link_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
