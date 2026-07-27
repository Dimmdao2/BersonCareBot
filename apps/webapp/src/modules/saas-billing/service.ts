import type {
  ResolvedSaasBillingPaymentProvider,
  SaasBillingPaymentProviderResolver,
  SaasBillingRepositoryPort,
  SaasBillingSettingsReadPort,
} from "./ports";
import {
  parseSaasBillingPaymentProviderSettings,
} from "./settings";

export function createSaasBillingService(dependencies: {
  repository: SaasBillingRepositoryPort;
  settings: SaasBillingSettingsReadPort;
  resolvePaymentProvider: SaasBillingPaymentProviderResolver;
}) {
  async function resolvePaymentProvider(): Promise<ResolvedSaasBillingPaymentProvider> {
    const settings = parseSaasBillingPaymentProviderSettings(
      await dependencies.settings.getSaasBillingPaymentProviderValue(),
    );
    const providerConfig = settings.providers.find(
      ({ id, enabled }) => id === settings.defaultProviderId && enabled,
    );
    if (!providerConfig) {
      throw new Error(`saas_billing_payment_provider_unavailable:${settings.defaultProviderId}`);
    }
    return {
      providerId: providerConfig.id,
      providerConfig,
      adapter: dependencies.resolvePaymentProvider(providerConfig.id),
    };
  }

  return {
    upsertManualSaasBillingSubscription(input: {
      organizationId: string;
      tariffId: string | null;
    }) {
      return dependencies.repository.upsertManualSaasBillingSubscription(input);
    },

    async createRenewalSaasBillingInvoice(input: {
      organizationId: string;
      saasBillingSubscriptionId: string;
      servicePeriodStartsAt: string;
      servicePeriodEndsAt: string;
      providerIdempotencyKey: string;
    }) {
      const provider = await resolvePaymentProvider();
      const invoice = await dependencies.repository.createSaasBillingInvoice({
        ...input,
        providerId: provider.providerId,
      });
      const intent = await provider.adapter.createIntent({
        amountMinor: invoice.amountMinor,
        currency: invoice.currency,
        idempotencyKey: invoice.providerIdempotencyKey,
        metadata: {
          organizationId: invoice.organizationId,
          saasBillingInvoiceId: invoice.id,
          saasBillingSubscriptionId: invoice.saasBillingSubscriptionId,
        },
        providerConfig: provider.providerConfig,
      });
      return dependencies.repository.attachSaasBillingInvoiceProviderIntent({
        saasBillingInvoiceId: invoice.id,
        providerInvoiceRef: intent.providerIntentRef,
        providerCheckoutUrl: intent.checkoutUrl ?? null,
      });
    },

    recordSaasBillingProviderEvent:
      dependencies.repository.recordSaasBillingProviderEvent.bind(dependencies.repository),
  };
}

export type SaasBillingService = ReturnType<typeof createSaasBillingService>;
