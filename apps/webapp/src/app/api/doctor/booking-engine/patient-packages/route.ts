import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorBookingEngine } from "../_requireDoctorBookingEngine";

const itemSchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.number().int().min(1),
  sortOrder: z.number().int().optional(),
});

const manualSchema = z.object({
  kind: z.literal("manual"),
  platformUserId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  priceMinor: z.number().int().min(0),
  currency: z.string().length(3).optional(),
  validityDays: z.number().int().min(1).nullable().optional(),
  deductionMode: z.enum(["auto_on_visit_confirmed", "manual"]).optional(),
  items: z.array(itemSchema).min(1),
  notes: z.string().trim().max(2000).optional(),
  sendForPayment: z.boolean().optional(),
  soldAt: z.string().datetime().optional(),
  paidAmountMinor: z.number().int().min(0).optional(),
  paidCurrency: z.string().length(3).optional(),
  activateImmediately: z.boolean().optional(),
});

const offerSchema = z.object({
  kind: z.literal("catalog"),
  platformUserId: z.string().uuid(),
  subscriptionPackageId: z.string().uuid(),
  soldAt: z.string().datetime().optional(),
  paidAmountMinor: z.number().int().min(0).optional(),
  paidCurrency: z.string().length(3).optional(),
  activateImmediately: z.boolean().optional(),
});

const postSchema = z.discriminatedUnion("kind", [manualSchema, offerSchema]);

export async function GET(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const platformUserId = new URL(request.url).searchParams.get("platformUserId")?.trim();
  if (!platformUserId) {
    return NextResponse.json({ ok: false, error: "platform_user_id_required" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }
  const packages = await deps.memberships.listPatientPackagesForUser(
    platformUserId,
    gate.ctx.organizationId,
  );
  return NextResponse.json({ ok: true, packages });
}

export async function POST(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }
  const body = parsed.data;
  if (body.kind === "manual") {
    const pkg = await deps.memberships.createManualPatientPackage({
      organizationId: gate.ctx.organizationId,
      platformUserId: body.platformUserId,
      title: body.title,
      priceMinor: body.priceMinor,
      currency: body.currency,
      validityDays: body.validityDays ?? null,
      deductionMode: body.deductionMode,
      items: body.items,
      assignedByPlatformUserId: gate.ctx.session.user.userId,
      notes: body.notes ?? null,
      sendForPayment: body.sendForPayment,
      soldAt: body.soldAt ?? null,
      paidAmountMinor: body.paidAmountMinor ?? null,
      paidCurrency: body.paidCurrency,
      activateImmediately: body.activateImmediately,
    });
    return NextResponse.json({ ok: true, package: pkg });
  }
  const pkg = await deps.memberships.offerCatalogPackageToPatient({
    organizationId: gate.ctx.organizationId,
    platformUserId: body.platformUserId,
    subscriptionPackageId: body.subscriptionPackageId,
    assignedByPlatformUserId: gate.ctx.session.user.userId,
    soldAt: body.soldAt ?? null,
    paidAmountMinor: body.paidAmountMinor ?? null,
    paidCurrency: body.paidCurrency,
    activateImmediately: body.activateImmediately,
  });
  return NextResponse.json({ ok: true, package: pkg });
}
