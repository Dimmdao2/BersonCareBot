import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { BE_PRODUCT_TYPES } from "@/modules/products/types";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  productType: z.enum(BE_PRODUCT_TYPES),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  priceMinor: z.number().int().min(0),
  currency: z.string().length(3).optional(),
  compositionJson: z.record(z.string(), z.unknown()).optional(),
  accessRulesJson: z.record(z.string(), z.unknown()).optional(),
  paymentRulesJson: z.record(z.string(), z.unknown()).optional(),
  validityDays: z.number().int().min(1).nullable().optional(),
  courseId: z.string().uuid().nullable().optional(),
  subscriptionPackageId: z.string().uuid().nullable().optional(),
  showInPatientCatalog: z.boolean().optional(),
  payByLinkEnabled: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.products) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }
  const products = await deps.products.listStaffProducts(gate.ctx.organizationId);
  return NextResponse.json({ ok: true, products });
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.products) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }
  const product = await deps.products.upsertProduct({
    organizationId: gate.ctx.organizationId,
    ...parsed.data,
    compositionJson: parsed.data.compositionJson as never,
    accessRulesJson: parsed.data.accessRulesJson as never,
  });
  return NextResponse.json({ ok: true, product });
}
