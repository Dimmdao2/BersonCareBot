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

import { runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { getPaymentProviderAdapter } from '@/infra/payments/paymentProviderRegistry';
import type { PaymentProviderConfig } from '@/modules/payments/types';
import {
  jsonError,
  jsonOk,
  mapApiError,
  type ApiErrorLiteralRules,
} from '@/shared/http/apiResponse';

type RouteContext = { params: Promise<{ provider: string }> };

const ACQUIRING_WEBHOOK_ERROR_RULES = {
  invalid_webhook_signature: { status: 401, code: 'invalid_webhook_signature' },
} as const satisfies ApiErrorLiteralRules;

export async function POST(request: Request, context: RouteContext) {
  stampBootstrapPrincipal('api/payments/patient-acquiring-webhook:POST:pre-routing', request);
  const { provider: providerId } = await context.params;
  const deps = buildAppDeps();

  // Load payment settings to get the webhook secret for this provider.
  if (!deps.payments) {
    return jsonError('payments_unavailable', {}, { status: 503 });
  }

  const bodyText = await request.text();

  let settings;
  try {
    settings = await deps.payments.getSettings();
  } catch {
    return jsonError('settings_unavailable', {}, { status: 503 });
  }

  const providerCfg = settings.providers.find(
    (p: PaymentProviderConfig) => p.id === providerId && p.enabled,
  );
  if (!providerCfg) {
    return jsonError('payment_provider_unavailable', {}, { status: 400 });
  }

  const secret = providerCfg.webhookSecret?.trim();
  if (!secret) {
    return jsonError('webhook_secret_missing', {}, { status: 503 });
  }

  // Verify the webhook signature using the provider adapter.
  let verified;
  try {
    const adapter = getPaymentProviderAdapter(providerId);
    verified = await adapter.verifyWebhook({
      headers: request.headers,
      bodyText,
      webhookSecret: secret,
      providerConfig: providerCfg,
    });
  } catch (error) {
    const mapped = mapApiError(error, ACQUIRING_WEBHOOK_ERROR_RULES, {
      status: 400,
      code: 'webhook_verification_failed',
    });
    return jsonError(mapped.code, mapped.publicFields ?? {}, {
      status: mapped.status,
      headers: mapped.headers,
    });
  }

  // Extract the provider payment reference from the verified event.
  // intentRef is set by the adapter; fall back to payload.intentRef for adapters that embed it there.
  const providerPaymentId =
    verified.intentRef ??
    (typeof verified.payload.intentRef === 'string' ? verified.payload.intentRef : null);

  if (!providerPaymentId) {
    // Webhook does not carry a payment reference we can look up — ack and ignore.
    return jsonOk({ ignored: true });
  }

  const organizationId =
    await deps.patientPayments.resolveOrganizationIdByProviderPaymentId(providerPaymentId);
  if (!organizationId) {
    return jsonOk({ ignored: true });
  }

  const result = await runWithDbOrganizationPrincipal(organizationId, () =>
    deps.patientPayments.handleAcquiringWebhookEvent({
      eventType: verified.eventType,
      providerPaymentId,
    }),
  );

  if (!result.ok) {
    if (result.reason === 'payment_not_found') {
      // Payment not found in patient ledger — may be a booking payment; ack to avoid retries.
      return jsonOk({ ignored: true });
    }
    return jsonError(result.reason, {}, { status: 400 });
  }

  return jsonOk({ alreadyProcessed: result.alreadyProcessed ?? false });
}
