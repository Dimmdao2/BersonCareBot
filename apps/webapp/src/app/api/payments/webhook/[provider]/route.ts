import { NextResponse } from "next/server";
import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";

type RouteContext = { params: Promise<{ provider: string }> };

export async function POST(request: Request, context: RouteContext) {
  stampBootstrapPrincipal("api/payments/webhook:POST:pre-routing");
  const { provider } = await context.params;
  const deps = buildAppDeps();
  if (!deps.payments || !deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "payments_unavailable" }, { status: 503 });
  }
  const payments = deps.payments;
  const bookingEngine = deps.bookingEngine;
  const organizationId = await bookingEngine.organization.getDefaultOrganizationId();
  const bodyText = await request.text();
  try {
    const result = await runWithDbOrganizationPrincipal(organizationId, () =>
      payments.processProviderWebhook({
        organizationId,
        providerId: provider,
        headers: request.headers,
        bodyText,
      }),
    );
    return NextResponse.json({ ok: true, duplicate: result.duplicate ?? false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook_failed";
    if (message === "invalid_webhook_signature") {
      return NextResponse.json({ ok: false, error: message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
