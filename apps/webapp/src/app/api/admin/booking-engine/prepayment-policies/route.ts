import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const upsertSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("service"),
    serviceId: z.string().uuid(),
    mode: z.enum(["disabled", "fixed_minor", "percent", "full_price"]),
    amountMinor: z.number().int().min(0).nullable().optional(),
    percentBps: z.number().int().min(0).max(10000).nullable().optional(),
    currency: z.string().min(3).max(3).optional(),
    isActive: z.boolean().optional(),
  }),
  z.object({
    scope: z.literal("online"),
    onlineCategory: z.enum(["rehab_lfk", "nutrition", "general"]),
    mode: z.enum(["disabled", "fixed_minor", "percent", "full_price"]),
    amountMinor: z.number().int().min(0).nullable().optional(),
    percentBps: z.number().int().min(0).max(10000).nullable().optional(),
    currency: z.string().min(3).max(3).optional(),
    isActive: z.boolean().optional(),
  }),
]);

export async function GET() {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.payments) {
    return NextResponse.json({ ok: false, error: "payments_unavailable" }, { status: 503 });
  }
  const policies = await deps.payments.listPrepaymentPolicies(gate.ctx.organizationId);
  return NextResponse.json({ ok: true, policies });
}

export async function PUT(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.payments) {
    return NextResponse.json({ ok: false, error: "payments_unavailable" }, { status: 503 });
  }
  const body = parsed.data;
  const policy = await deps.payments.upsertPrepaymentPolicy({
    organizationId: gate.ctx.organizationId,
    serviceId: body.scope === "service" ? body.serviceId : null,
    onlineCategory: body.scope === "online" ? body.onlineCategory : null,
    mode: body.mode,
    amountMinor: body.amountMinor ?? null,
    percentBps: body.percentBps ?? null,
    currency: body.currency,
    isActive: body.isActive,
  });
  return NextResponse.json({ ok: true, policy });
}
