import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const itemSchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.number().int().min(1),
  sortOrder: z.number().int().optional(),
});

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  priceMinor: z.number().int().min(0),
  currency: z.string().length(3).optional(),
  validityDays: z.number().int().min(1).nullable().optional(),
  deductionMode: z.enum(["auto_on_visit_confirmed", "manual"]).optional(),
  isActive: z.boolean().optional(),
  items: z.array(itemSchema).min(1),
});

export async function GET() {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }
  const packages = await deps.memberships.listCatalogPackages(gate.ctx.organizationId, false);
  return NextResponse.json({ ok: true, packages });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }
  const pkg = await deps.memberships.upsertCatalogPackage({
    organizationId: gate.ctx.organizationId,
    ...parsed.data,
  });
  return NextResponse.json({ ok: true, package: pkg });
}
