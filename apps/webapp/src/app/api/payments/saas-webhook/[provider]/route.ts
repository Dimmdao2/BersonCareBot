/**
 * POST /api/payments/saas-webhook/[provider]
 *
 * Receives the SaaS platform tariff payment webhook — the clinic paying US, never a booking/patient
 * payment. Separate route, separate config (global platform provider under `saas_billing_payment_provider`,
 * not any per-org booking provider), separate table family (`saas_billing_*`).
 *
 * §5a/2.1c invariant: this path must never depend on org commercial/lifecycle state — a blocked
 * clinic must still be able to pay to lift the block. Enforced structurally, not by a runtime check:
 * `modules/saas-billing/service.test.ts` parses this file and fails the build if it ever imports
 * org-entitlements/requireEntitlement/cabinetAccessGate.
 *
 * Flow:
 * 1. Resolve the GLOBAL provider config for `provider` (bootstrap principal — organization unknown yet).
 * 2. Verify signature via the existing PaymentProviderPort adapter (forged signature -> 401, nothing written).
 * 3. Resolve the invoice by provider ref; unknown ref -> safe-acknowledge (2xx, no write) so the
 *    provider stops retrying. Amount/currency mismatch against the invoice's own record -> same
 *    safe-acknowledge, no write.
 * 4. Capture is org-scoped and idempotent: the provider-event table's unique key makes a replayed
 *    event a no-op (no double payment, no access change).
 */

import { runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import {
  jsonError,
  jsonOk,
  mapApiError,
  type ApiErrorLiteralRules,
} from '@/shared/http/apiResponse';

type RouteContext = { params: Promise<{ provider: string }> };

const SAAS_WEBHOOK_ERROR_RULES = {
  invalid_webhook_signature: { status: 401, code: 'invalid_webhook_signature' },
} as const satisfies ApiErrorLiteralRules;

export async function POST(request: Request, context: RouteContext) {
  stampBootstrapPrincipal('api/payments/saas-webhook:POST:pre-routing', request);
  const { provider: providerId } = await context.params;
  const deps = buildAppDeps();
  const bodyText = await request.text();

  let resolvedProvider;
  try {
    resolvedProvider = await deps.saasBilling.resolveSaasBillingPaymentProvider(providerId);
  } catch {
    return jsonError('payment_provider_unavailable', {}, { status: 400 });
  }

  const secret = resolvedProvider.providerConfig.webhookSecret?.trim();
  if (!secret) {
    return jsonError('webhook_secret_missing', {}, { status: 503 });
  }

  let verified;
  try {
    verified = await resolvedProvider.adapter.verifyWebhook({
      headers: request.headers,
      bodyText,
      webhookSecret: secret,
      providerConfig: resolvedProvider.providerConfig,
    });
  } catch (error) {
    const mapped = mapApiError(error, SAAS_WEBHOOK_ERROR_RULES, {
      status: 400,
      code: 'webhook_verification_failed',
    });
    return jsonError(mapped.code, mapped.publicFields ?? {}, {
      status: mapped.status,
      headers: mapped.headers,
    });
  }

  // К2 — refund confirmations arrive through this same receiver (same IP-allowlist, same
  // signature-less API refetch), resolved against saas_billing_refunds instead of invoices: a
  // refund event's ref is a refund id, never the invoice's payment ref.
  if (verified.eventType.startsWith('refund.')) {
    const resolvedRefund = await deps.saasBilling.resolveSaasBillingRefundForWebhook({
      providerId: resolvedProvider.providerId,
      verified,
    });
    if (resolvedRefund.outcome === 'unknown_reference') {
      return jsonOk({ acknowledged: true, reason: 'unknown_reference' as const });
    }
    if (resolvedRefund.outcome === 'mismatch') {
      return jsonOk({ acknowledged: true, reason: `${resolvedRefund.field}_mismatch` as const });
    }
    const refundResult = await runWithDbOrganizationPrincipal(resolvedRefund.organizationId, () =>
      deps.saasBilling.captureSaasBillingRefundWebhookEvent({
        organizationId: resolvedRefund.organizationId,
        saasBillingInvoiceId: resolvedRefund.saasBillingInvoiceId,
        saasBillingRefundId: resolvedRefund.saasBillingRefundId,
        providerId: resolvedProvider.providerId,
        verified,
      }),
    );
    return jsonOk({ captured: refundResult.captured, duplicate: refundResult.duplicate });
  }

  const resolved = await deps.saasBilling.resolveSaasBillingInvoiceForWebhook({
    providerId: resolvedProvider.providerId,
    verified,
  });

  if (resolved.outcome === 'unknown_reference') {
    return jsonOk({ acknowledged: true, reason: 'unknown_reference' as const });
  }
  if (resolved.outcome === 'mismatch') {
    return jsonOk({ acknowledged: true, reason: `${resolved.field}_mismatch` as const });
  }

  const result = await runWithDbOrganizationPrincipal(resolved.organizationId, () =>
    deps.saasBilling.captureSaasBillingProviderWebhookEvent({
      organizationId: resolved.organizationId,
      saasBillingInvoiceId: resolved.saasBillingInvoiceId,
      providerId: resolvedProvider.providerId,
      verified,
    }),
  );

  return jsonOk({ captured: result.captured, duplicate: result.duplicate });
}
