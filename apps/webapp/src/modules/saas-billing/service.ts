import type {
  ResolvedSaasBillingPaymentProvider,
  SaasBillingPaymentProviderResolver,
  SaasBillingProviderEventEnvelope,
  SaasBillingRepositoryPort,
  SaasBillingSettingsReadPort,
} from './ports';
import { sanitizeSaasBillingProviderEventEnvelope } from './providerEventEnvelope';
import { parseSaasBillingPaymentProviderSettings } from './settings';
import type { MechanicAccessState } from '@/modules/org-entitlements/types';

/**
 * §5a/2.1c: paying the platform is the recovery path, not a tariff mechanic. Every cabinet state,
 * including the terminal block, is intentionally accepted here.
 */
export function assertOwnTariffPaymentAvailable(state: MechanicAccessState): void {
  switch (state) {
    case 'full_access':
    case 'grace':
    case 'read_only':
    case 'disabled':
    case 'unconfigured':
      return;
  }
}

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
    getOrganizationBillingOverview(organizationId: string) {
      return dependencies.repository.getOrganizationBillingOverview(organizationId);
    },

    assignManualTariff(input: {
      organizationId: string;
      tariffId: string | null;
      audit: { actorId: string | null; reason: string };
    }) {
      return dependencies.repository.runManualAssignmentTransaction(async (transaction) => {
        const state = await transaction.loadManualAssignmentState(input.organizationId);
        const currentManualTariffId =
          state.manualSaasBillingSubscription?.status === 'active'
            ? state.manualSaasBillingSubscription.tariffId
            : null;
        if (
          input.tariffId === currentManualTariffId &&
          (!state.activeTrial || input.tariffId === null)
        ) {
          return;
        }

        if (input.tariffId) {
          await transaction.requireActiveTariff(input.tariffId);
        }
        await transaction.setManualSaasBillingSubscription({
          organizationId: input.organizationId,
          tariffId: input.tariffId,
        });
        const organization = await transaction.updateCompatibilityProjection({
          organizationId: input.organizationId,
          tariffId: input.tariffId,
        });
        const endedTrial = state.activeTrial
          ? await transaction.endActiveTrial(state.activeTrial.id)
          : null;
        await transaction.appendManualAssignmentAudit({
          ...input.audit,
          action: state.activeTrial
            ? 'saas_trial_convert_to_manual_tariff'
            : input.tariffId
              ? 'saas_tariff_assign'
              : 'saas_tariff_unassign',
          targetId: input.organizationId,
          organizationId: input.organizationId,
          before: {
            organization: state.organization,
            trial: state.activeTrial,
            saasBillingSubscription: state.manualSaasBillingSubscription,
          },
          after: { organization, trial: endedTrial },
        });
      });
    },

    async createRenewalSaasBillingInvoice(input: {
      organizationId: string;
      saasBillingSubscriptionId: string;
      servicePeriodStartsAt: string;
      servicePeriodEndsAt: string;
      providerIdempotencyKey: string;
      cabinetAccessState: MechanicAccessState;
    }) {
      assertOwnTariffPaymentAvailable(input.cabinetAccessState);
      const provider = await resolvePaymentProvider();
      const invoice = await dependencies.repository.createSaasBillingInvoice({
        organizationId: input.organizationId,
        saasBillingSubscriptionId: input.saasBillingSubscriptionId,
        servicePeriodStartsAt: input.servicePeriodStartsAt,
        servicePeriodEndsAt: input.servicePeriodEndsAt,
        providerIdempotencyKey: input.providerIdempotencyKey,
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

    recordSaasBillingProviderEvent(input: {
      organizationId: string;
      saasBillingInvoiceId: string | null;
      event: SaasBillingProviderEventEnvelope;
    }) {
      return dependencies.repository.recordSaasBillingProviderEvent({
        ...input,
        event: sanitizeSaasBillingProviderEventEnvelope(input.event),
      });
    },
  };
}

export type SaasBillingService = ReturnType<typeof createSaasBillingService>;
