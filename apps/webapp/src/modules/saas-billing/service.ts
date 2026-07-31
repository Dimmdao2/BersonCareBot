import type {
  ResolvedSaasBillingPaymentProvider,
  SaasBillingPaymentProviderResolver,
  SaasBillingProviderEventEnvelope,
  SaasBillingRepositoryPort,
  SaasBillingSettingsReadPort,
} from './ports';
import { paidPeriodEndsAt } from './paidPeriod';
import { sanitizeSaasBillingProviderEventEnvelope } from './providerEventEnvelope';
import { parseSaasBillingPaymentProviderSettings } from './settings';

/**
 * §5a/2.1c — INVARIANT OF THE TWO MONEY FLOWS. The path by which a clinic pays US for its tariff is
 * untouched by the access ladder in every state, including the terminal cabinet block: otherwise the
 * block could not be lifted by paying and would be inescapable. Concretely, this module must never
 * gain a dependency on `org-entitlements` / `requireEntitlement`. That is enforced by
 * `service.test.ts` (§5a/2.1c suite), not by a runtime check here — a runtime check would be the
 * very coupling the invariant forbids.
 */

export function createSaasBillingService(dependencies: {
  repository: SaasBillingRepositoryPort;
  settings: SaasBillingSettingsReadPort;
  resolvePaymentProvider: SaasBillingPaymentProviderResolver;
  /** Injected so the paid period a test asserts is the one it set, not the wall clock. */
  now?: () => Date;
}) {
  const now = dependencies.now ?? (() => new Date());
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

        // §5a item 7.0 — assignment is what STARTS the organization's paid period. Before this the
        // subscription row carried no period at all, so "период кончился и не оплачен" was a state
        // the product could not reach and the ladder had nothing but an expired trial to run on.
        // The length is the owner's `billing_period` on the tariff, never a number chosen here.
        const startsAt = now().toISOString();
        const period = input.tariffId
          ? {
              startsAt,
              endsAt: paidPeriodEndsAt(
                startsAt,
                (await transaction.requireActiveTariff(input.tariffId)).billingPeriod,
              ),
            }
          : null;
        await transaction.setManualSaasBillingSubscription({
          organizationId: input.organizationId,
          tariffId: input.tariffId,
          period,
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
