/**
 * POST /api/payments/patient-acquiring-webhook/[provider]
 *
 * Receiving webhook from the acquiring payment provider for patient payments.
 * No auth required — the request is authenticated via provider signature verification.
 *
 * Flow:
 * 1. Read raw body (required for signature verification).
 * 2. Load payment provider config to retrieve the webhook secret.
 * 3. Verify signature via PaymentProviderPort adapter.
 * 4. Delegate status-update business logic to PatientPaymentsService.handleAcquiringWebhookEvent.
 * 5. Return 200 { ok: true } on success; 401 on invalid signature; 404 if payment not found.
 *
 * FIN-02
 */

import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getPaymentProviderAdapter } from "@/infra/payments/paymentProviderRegistry";
import type { PaymentProviderConfig } from "@/modules/payments/types";

type RouteContext = { params: Promise<{ provider: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { provider: providerId } = await context.params;
  const deps = buildAppDeps();

  // Load payment settings to get the webhook secret for this provider.
  if (!deps.payments) {
    return NextResponse.json({ ok: false, error: "payments_unavailable" }, { status: 503 });
  }

  const bodyText = await request.text();

  let settings;
  try {
    settings = await deps.payments.getSettings();
  } catch {
    return NextResponse.json({ ok: false, error: "settings_unavailable" }, { status: 503 });
  }

  const providerCfg = settings.providers.find((p: PaymentProviderConfig) => p.id === providerId && p.enabled);
  if (!providerCfg) {
    return NextResponse.json(
      { ok: false, error: `payment_provider_unavailable:${providerId}` },
      { status: 400 },
    );
  }

  const secret = providerCfg.webhookSecret?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "webhook_secret_missing" }, { status: 503 });
  }

  // Verify the webhook signature using the provider adapter.
  let verified;
  try {
    const adapter = getPaymentProviderAdapter(providerId);
    verified = adapter.verifyWebhook({
      headers: request.headers,
      bodyText,
      webhookSecret: secret,
      providerConfig: providerCfg,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook_verification_failed";
    if (message === "invalid_webhook_signature") {
      return NextResponse.json({ ok: false, error: message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  // Extract the provider payment reference from the verified event.
  // intentRef is set by the adapter; fall back to payload.intentRef for adapters that embed it there.
  const providerPaymentId =
    verified.intentRef ??
    (typeof verified.payload.intentRef === "string" ? verified.payload.intentRef : null);

  if (!providerPaymentId) {
    // Webhook does not carry a payment reference we can look up — ack and ignore.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const result = await deps.patientPayments.handleAcquiringWebhookEvent({
    eventType: verified.eventType,
    providerPaymentId,
  });

  if (!result.ok) {
    if (result.reason === "payment_not_found") {
      // Payment not found in patient ledger — may be a booking payment; ack to avoid retries.
      return NextResponse.json({ ok: true, ignored: true });
    }
    return NextResponse.json({ ok: false, error: result.reason }, { status: 400 });
  }

  return NextResponse.json({ ok: true, alreadyProcessed: result.alreadyProcessed ?? false });
}
