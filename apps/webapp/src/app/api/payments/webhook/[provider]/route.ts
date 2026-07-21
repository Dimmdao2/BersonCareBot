import { NextResponse } from "next/server";
import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { getPaymentProviderAdapter } from "@/infra/payments/paymentProviderRegistry";
import type { PaymentProviderConfig } from "@/modules/payments/types";

type RouteContext = { params: Promise<{ provider: string }> };

export async function POST(request: Request, context: RouteContext) {
  stampBootstrapPrincipal("api/payments/webhook:POST:pre-routing", request);
  const { provider } = await context.params;
  const deps = buildAppDeps();
  if (!deps.payments) {
    return NextResponse.json({ ok: false, error: "payments_unavailable" }, { status: 503 });
  }
  const payments = deps.payments;
  const bodyText = await request.text();
  try {
    const settings = await payments.getSettings();
    const providerCfg = settings.providers.find(
      (p: PaymentProviderConfig) => p.id === provider && p.enabled,
    );
    if (!providerCfg) {
      return NextResponse.json(
        { ok: false, error: `payment_provider_unavailable:${provider}` },
        { status: 400 },
      );
    }
    const secret = providerCfg.webhookSecret?.trim();
    if (!secret) {
      return NextResponse.json({ ok: false, error: "webhook_secret_missing" }, { status: 503 });
    }
    const verified = getPaymentProviderAdapter(provider).verifyWebhook({
      headers: request.headers,
      bodyText,
      webhookSecret: secret,
      providerConfig: providerCfg,
    });
    const intentId = typeof verified.payload.intentId === "string" ? verified.payload.intentId : null;
    const organizationId = await payments.resolveProviderWebhookOrganizationId({
      providerId: provider,
      intentId,
      providerIntentRef: verified.intentRef ?? String(verified.payload.intentRef ?? ""),
    });
    if (!organizationId) {
      return NextResponse.json({ ok: true, ignored: true });
    }
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
