/**
 * Registry-backed AcquiringGatewayPort implementation.
 *
 * Bridges AcquiringGatewayPort (modules/patient-payments/ports.ts) to the shared
 * PaymentProviderPort adapter registry (infra/payments/paymentProviderRegistry.ts).
 *
 * This is the unification seam:
 *   - booking prepayments use PaymentProviderPort adapters via paymentProviderRegistry directly.
 *   - patient-payments «Учётка» acquiring uses AcquiringGatewayPort backed by the same adapters.
 *
 * Configuration is read from system_settings.booking_payment_providers (already used by booking
 * payments) — same source of truth, no duplication.
 *
 * Usage in buildAppDeps:
 *   const acquiringGateway = createRegistryAcquiringGateway({
 *     getConfig: () => paymentsConfigReader.getBookingPaymentSettings(),
 *   });
 */

import { getPaymentProviderAdapter } from "./paymentProviderRegistry";
import type { AcquiringGatewayPort } from "@/modules/patient-payments/ports";
import type { BookingPaymentSettings } from "@/modules/payments/types";

export type AcquiringGatewayConfig = {
  /**
   * Async getter for the active payment settings.
   * Typically delegates to createPaymentsConfigReader().getBookingPaymentSettings().
   */
  getConfig: () => Promise<BookingPaymentSettings>;
};

/**
 * Create a registry-backed AcquiringGatewayPort that delegates to the same
 * PaymentProviderPort adapters used by booking payments.
 *
 * The default provider is resolved from BookingPaymentSettings.defaultProviderId.
 * An explicit providerId can be passed in createCharge metadata to override.
 */
export function createRegistryAcquiringGateway(
  config: AcquiringGatewayConfig,
): AcquiringGatewayPort {
  async function resolveProvider(explicitProviderId?: string) {
    const settings = await config.getConfig();
    if (!settings.enabled) throw new Error("payments_disabled");
    const id = (explicitProviderId ?? settings.defaultProviderId).trim();
    const providerCfg = settings.providers.find((p) => p.id === id && p.enabled);
    if (!providerCfg) throw new Error(`payment_provider_unavailable:${id}`);
    const adapter = getPaymentProviderAdapter(id);
    return { adapter, providerCfg };
  }

  return {
    async createCharge(input) {
      const explicitProvider =
        typeof input.metadata?.providerId === "string" ? input.metadata.providerId : undefined;
      let adapter;
      let providerCfg;
      try {
        ({ adapter, providerCfg } = await resolveProvider(explicitProvider));
      } catch (err) {
        return {
          ok: false,
          reason: err instanceof Error ? err.message : "provider_error",
        };
      }

      try {
        const returnUrl =
          typeof input.metadata?.returnUrl === "string"
            ? input.metadata.returnUrl
            : undefined;
        const result = await adapter.createIntent({
          amountMinor: input.amountMinor,
          currency: input.currency,
          idempotencyKey: `acquiring:${input.patientUserId}:${input.amountMinor}:${Date.now()}`,
          metadata: {
            patientUserId: input.patientUserId,
            description: input.description,
            returnUrl,
            ...input.metadata,
          },
          providerConfig: providerCfg,
        });
        return {
          ok: true,
          providerPaymentId: result.providerIntentRef,
          redirectUrl: result.checkoutUrl,
        };
      } catch (err) {
        return {
          ok: false,
          reason: err instanceof Error ? err.message : "provider_error",
        };
      }
    },

    async refund(input) {
      let adapter;
      let providerCfg;
      try {
        ({ adapter, providerCfg } = await resolveProvider());
      } catch (err) {
        return {
          ok: false,
          reason: err instanceof Error ? err.message : "provider_error",
        };
      }

      try {
        const result = await adapter.refund({
          providerIntentRef: input.providerPaymentId,
          amountMinor: input.amountMinor,
          currency: input.currency,
          idempotencyKey: input.idempotencyKey,
          providerConfig: providerCfg,
        });
        return { ok: true, providerRefundRef: result.providerRefundRef };
      } catch (err) {
        return {
          ok: false,
          reason: err instanceof Error ? err.message : "provider_error",
        };
      }
    },

    verifyWebhook(input) {
      // Synchronous — can't await config here. Caller must pass the provider ID
      // in the route (e.g. /api/payments/webhook/[provider]) and we resolve directly.
      // For the general case we throw — use the booking webhook route instead.
      // This method exists to satisfy the interface; patient-payments acquiring webhook
      // should route through /api/payments/webhook/[provider] (booking route) which
      // already handles verification via PaymentProviderPort.
      throw new Error("use_booking_webhook_route_for_verification");
    },
  };
}
