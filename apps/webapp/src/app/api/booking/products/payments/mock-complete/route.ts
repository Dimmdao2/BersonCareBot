import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { withExplicitOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { routePaths } from "@/app-layer/routes/paths";

const bodySchema = z.object({
  intentId: z.string().uuid(),
});

export async function POST(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.purchases });
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.products || !deps.payments) {
    return NextResponse.json({ ok: false, error: "products_unavailable" }, { status: 503 });
  }
  const organizationId = await deps.payments.resolveIntentOrganizationId(parsed.data.intentId);
  if (!organizationId) {
    return NextResponse.json({ ok: false, error: "intent_not_found" }, { status: 404 });
  }
  try {
    const result = await withExplicitOrganizationPrincipal(
      { organizationId, source: "api/booking/products/payments/mock-complete:POST" },
      () =>
        deps.products!.captureProductPayment(
          parsed.data.intentId,
          organizationId,
          gate.session.user.userId,
        ),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "capture_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
