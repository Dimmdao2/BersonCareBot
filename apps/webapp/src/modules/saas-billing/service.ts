import { randomUUID } from 'node:crypto';
import type { PaymentProviderVerifyResult } from '@/modules/payments/providerPort';
import type {
  ResolvedSaasBillingPaymentProvider,
  SaasBillingInvoiceStatus,
  SaasBillingPaymentProviderResolver,
  SaasBillingPlatformSummaryFilter,
  SaasBillingProviderEventEnvelope,
  SaasBillingReconciliationDiscrepancy,
  SaasBillingReconciliationResult,
  SaasBillingRefund,
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
  /** `providerId` picks a specific configured provider (e.g. the one named in a webhook URL); omitted, it's the global default. */
  async function resolvePaymentProvider(
    providerId?: string,
  ): Promise<ResolvedSaasBillingPaymentProvider> {
    const settings = parseSaasBillingPaymentProviderSettings(
      await dependencies.settings.getSaasBillingPaymentProviderValue(),
    );
    const id = providerId ?? settings.defaultProviderId;
    const providerConfig = settings.providers.find((p) => p.id === id && p.enabled);
    if (!providerConfig) {
      throw new Error(`saas_billing_payment_provider_unavailable:${id}`);
    }
    return {
      providerId: providerConfig.id,
      providerConfig,
      adapter: dependencies.resolvePaymentProvider(providerConfig.id),
    };
  }

  async function createRenewalSaasBillingInvoice(input: {
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
  }

  /**
   * К4 — platform-admin-issued invoice for the organization's OWN currently assigned tariff, via
   * YooKassa's `/v3/invoices` (a shareable link) rather than `createIntent`'s direct payment. Amount/
   * description/expiry are admin-chosen; the tariff, subscription and resulting service period are
   * server-resolved from the organization's existing assignment, same authority K0 uses.
   */
  async function createManualSaasBillingInvoice(input: {
    organizationId: string;
    amountMinor: number;
    currency: string;
    description: string;
    expiresAt: string;
  }) {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error('saas_billing_manual_invoice_amount_must_be_positive_integer');
    }
    const description = input.description.trim();
    if (!description) {
      throw new Error('saas_billing_manual_invoice_description_required');
    }
    const expiresAtMs = new Date(input.expiresAt).getTime();
    if (Number.isNaN(expiresAtMs) || expiresAtMs <= now().getTime()) {
      throw new Error('saas_billing_manual_invoice_expiry_invalid');
    }

    const { saasBillingSubscriptionId, billingPeriod } =
      await dependencies.repository.requireOwnTariffBillingSubscription(input.organizationId);
    const servicePeriodStartsAt = now().toISOString();
    const servicePeriodEndsAt = paidPeriodEndsAt(servicePeriodStartsAt, billingPeriod);

    const provider = await resolvePaymentProvider();
    if (!provider.adapter.createInvoice) {
      throw new Error(`saas_billing_provider_invoices_unsupported:${provider.providerId}`);
    }

    const invoice = await dependencies.repository.createManualSaasBillingInvoice({
      organizationId: input.organizationId,
      saasBillingSubscriptionId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      description,
      servicePeriodStartsAt,
      servicePeriodEndsAt,
      expiresAt: input.expiresAt,
      providerId: provider.providerId,
      providerIdempotencyKey: `saas_manual_invoice:${input.organizationId}:${randomUUID()}`,
    });

    const created = await provider.adapter.createInvoice({
      amountMinor: invoice.amountMinor,
      currency: invoice.currency,
      description,
      expiresAt: input.expiresAt,
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
      providerInvoiceRef: created.providerInvoiceRef,
      providerCheckoutUrl: created.checkoutUrl,
    });
  }

  return {
    getOrganizationBillingOverview(organizationId: string) {
      return dependencies.repository.getOrganizationBillingOverview(organizationId);
    },

    /** К1 — platform-wide payments journal, filtered by period/status/payer. Never org-scoped. */
    listPlatformPayments(filter: {
      periodFrom?: string;
      periodTo?: string;
      status?: SaasBillingInvoiceStatus;
      payerSearch?: string;
    }) {
      return dependencies.repository.listPlatformInvoices(filter);
    },

    /** К3 — period summary, broken down by status; see `SaasBillingPlatformSummaryFilter`. */
    getPlatformPaymentsSummary(filter: SaasBillingPlatformSummaryFilter) {
      return dependencies.repository.getPlatformPaymentsSummary(filter);
    },

    /** К3 — "разрез по видам покупок" (tariff × billing period). */
    getPlatformPaymentsBreakdown(filter: SaasBillingPlatformSummaryFilter) {
      return dependencies.repository.getPlatformPaymentsBreakdown(filter);
    },

    /**
     * К3 — reconciliation against the provider's own `GET /v3/payments` list for the period.
     * Read-only: never writes back to the journal, however it disagrees with the provider — the
     * plan is explicit that a human decides, not this call (item 3 of К3).
     */
    async reconcilePlatformPaymentsWithProvider(input: {
      periodFrom: string;
      periodTo: string;
    }): Promise<SaasBillingReconciliationResult> {
      const provider = await resolvePaymentProvider();
      if (!provider.adapter.listPayments) {
        return { outcome: 'provider_unavailable', providerId: provider.providerId };
      }

      const [journalRows, providerList] = await Promise.all([
        dependencies.repository.listPlatformInvoices({
          periodFrom: input.periodFrom,
          periodTo: input.periodTo,
        }),
        provider.adapter
          .listPayments({
            periodFromIso: input.periodFrom,
            periodToIso: input.periodTo,
            providerConfig: provider.providerConfig,
          })
          .catch(() => null),
      ]);
      if (!providerList) {
        return { outcome: 'provider_error', providerId: provider.providerId };
      }

      // Only invoices actually raised against THIS provider and that reached it (have a
      // providerInvoiceRef) are comparable — a `draft` invoice never left our journal.
      const comparableJournalRows = journalRows.filter(
        (row) => row.providerId === provider.providerId && row.providerInvoiceRef,
      );
      const journalByRef = new Map(
        comparableJournalRows.map((row) => [row.providerInvoiceRef as string, row]),
      );
      const providerByRef = new Map(
        providerList.items.map((item) => [item.providerPaymentRef, item]),
      );

      const discrepancies: SaasBillingReconciliationDiscrepancy[] = [];
      for (const row of comparableJournalRows) {
        const providerRef = row.providerInvoiceRef as string;
        const match = providerByRef.get(providerRef);
        if (!match) {
          discrepancies.push({
            kind: 'missing_in_provider',
            saasBillingInvoiceId: row.id,
            organizationTitle: row.organizationTitle,
            providerInvoiceRef: providerRef,
            amountMinor: row.amountMinor,
            currency: row.currency,
          });
          continue;
        }
        if (match.amountMinor !== row.amountMinor || match.currency !== row.currency) {
          discrepancies.push({
            kind: 'amount_mismatch',
            saasBillingInvoiceId: row.id,
            organizationTitle: row.organizationTitle,
            providerInvoiceRef: providerRef,
            journalAmountMinor: row.amountMinor,
            journalCurrency: row.currency,
            providerAmountMinor: match.amountMinor,
            providerCurrency: match.currency,
          });
        }
      }
      for (const item of providerList.items) {
        if (!journalByRef.has(item.providerPaymentRef)) {
          discrepancies.push({
            kind: 'missing_in_journal',
            providerPaymentRef: item.providerPaymentRef,
            providerStatus: item.status,
            amountMinor: item.amountMinor,
            currency: item.currency,
          });
        }
      }

      return {
        outcome: 'ok',
        providerId: provider.providerId,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        checkedAt: now().toISOString(),
        journalCount: comparableJournalRows.length,
        providerCount: providerList.items.length,
        truncated: providerList.truncated,
        discrepancies,
      };
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

    createRenewalSaasBillingInvoice,

    createManualSaasBillingInvoice,

    /** К4 — only a `draft`/`pending` invoice can be cancelled; see `cancelSaasBillingInvoice` port doc. */
    cancelSaasBillingInvoice(input: {
      saasBillingInvoiceId: string;
      actorId: string | null;
      reason: string;
    }) {
      return dependencies.repository.cancelSaasBillingInvoice(input);
    },

    /**
     * К5 — the background renewal tick. Called only from the internal cron route
     * (`/api/internal/saas-billing/renewal/tick`), never from a user request or a screen open.
     *
     * Two clearly separate steps, per §5a-К5's wall: the repository call below is the ONLY place
     * that enumerates "which organizations are due" (filtering happens there, under the platform DB
     * principal the caller entered before calling this); every subscription it returns is then
     * handed, one at a time, to a per-subscription invoice call that acts strictly on the row it was
     * given — it never re-queries "all subscriptions" itself. Repeat ticks for a subscription whose
     * period was already invoiced fall through to `created: false` for that row
     * (`saas_billing_invoices_period_uidx`) instead of raising a second invoice or charging the
     * provider twice.
     */
    async runDueSaasBillingRenewals(
      input: { limit?: number } = {},
    ): Promise<{
      dueCount: number;
      created: number;
      alreadyInvoiced: number;
      failed: number;
      errors: Array<{ organizationId: string; saasBillingSubscriptionId: string; error: string }>;
    }> {
      const asOf = now().toISOString();
      const due = await dependencies.repository.listSaasBillingSubscriptionsDueForRenewal({
        asOf,
        limit: input.limit ?? 50,
      });

      let created = 0;
      let alreadyInvoiced = 0;
      let failed = 0;
      const errors: Array<{
        organizationId: string;
        saasBillingSubscriptionId: string;
        error: string;
      }> = [];

      for (const subscription of due) {
        // §5a item 7.0 arithmetic: the new period starts exactly where the paid one ended, never
        // "now" — a late tick must not hand the clinic extra free days.
        const servicePeriodStartsAt = subscription.currentPeriodEndsAt;
        const servicePeriodEndsAt = paidPeriodEndsAt(
          servicePeriodStartsAt,
          subscription.billingPeriod,
        );
        try {
          const provider = await resolvePaymentProvider();
          const { invoice, created: wasCreated } =
            await dependencies.repository.createSaasBillingRenewalInvoiceIfAbsent({
              organizationId: subscription.organizationId,
              saasBillingSubscriptionId: subscription.saasBillingSubscriptionId,
              providerId: provider.providerId,
              providerIdempotencyKey: `saas_tariff_auto_renewal:${subscription.saasBillingSubscriptionId}:${servicePeriodStartsAt}`,
              servicePeriodStartsAt,
              servicePeriodEndsAt,
            });
          if (!wasCreated) {
            alreadyInvoiced += 1;
            continue;
          }
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
          await dependencies.repository.attachSaasBillingInvoiceProviderIntent({
            saasBillingInvoiceId: invoice.id,
            providerInvoiceRef: intent.providerIntentRef,
            providerCheckoutUrl: intent.checkoutUrl ?? null,
          });
          created += 1;
        } catch (error) {
          failed += 1;
          errors.push({
            organizationId: subscription.organizationId,
            saasBillingSubscriptionId: subscription.saasBillingSubscriptionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return { dueCount: due.length, created, alreadyInvoiced, failed, errors };
    },

    /**
     * K0 — the clinic-facing "pay for our tariff" entry point. Amount, tariff and organization are
     * ALL server-derived: the tariff is whatever the platform admin already assigned
     * (`requireOwnTariffBillingSubscription`), the amount comes from that tariff's own price row
     * (`createSaasBillingInvoice`), and the organization is the caller's own, never a request body
     * field. One renewal period starting now, same arithmetic as manual assignment (`paidPeriod.ts`).
     */
    async createOwnTariffRenewalInvoice(organizationId: string) {
      const { saasBillingSubscriptionId, billingPeriod } =
        await dependencies.repository.requireOwnTariffBillingSubscription(organizationId);
      const servicePeriodStartsAt = now().toISOString();
      const servicePeriodEndsAt = paidPeriodEndsAt(servicePeriodStartsAt, billingPeriod);
      return createRenewalSaasBillingInvoice({
        organizationId,
        saasBillingSubscriptionId,
        servicePeriodStartsAt,
        servicePeriodEndsAt,
        providerIdempotencyKey: `saas_tariff_renewal:${organizationId}:${saasBillingSubscriptionId}:${randomUUID()}`,
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

    resolveSaasBillingPaymentProvider(providerId?: string) {
      return resolvePaymentProvider(providerId);
    },

    /**
     * Unscoped by design — the webhook does not know the organization until an invoice with this
     * `providerId`/`intentRef` is found. No write happens here; capture is a separate, org-scoped step.
     */
    async resolveSaasBillingInvoiceForWebhook(input: {
      providerId: string;
      verified: Pick<PaymentProviderVerifyResult, 'intentRef' | 'amountMinor' | 'payload'>;
    }): Promise<
      | { outcome: 'unknown_reference' }
      | { outcome: 'mismatch'; field: 'amount' | 'currency' }
      | { outcome: 'resolved'; organizationId: string; saasBillingInvoiceId: string }
    > {
      const providerInvoiceRef = input.verified.intentRef?.trim();
      if (!providerInvoiceRef) return { outcome: 'unknown_reference' };
      const invoice = await dependencies.repository.findSaasBillingInvoiceByProviderRef({
        providerId: input.providerId,
        providerInvoiceRef,
      });
      if (!invoice) return { outcome: 'unknown_reference' };

      if (
        input.verified.amountMinor !== undefined &&
        input.verified.amountMinor !== invoice.amountMinor
      ) {
        return { outcome: 'mismatch', field: 'amount' };
      }
      const payloadCurrency =
        typeof input.verified.payload.currency === 'string'
          ? input.verified.payload.currency
          : undefined;
      if (payloadCurrency !== undefined && payloadCurrency !== invoice.currency) {
        return { outcome: 'mismatch', field: 'currency' };
      }

      return {
        outcome: 'resolved',
        organizationId: invoice.organizationId,
        saasBillingInvoiceId: invoice.id,
      };
    },

    /** Org-scoped: call only after `resolveSaasBillingInvoiceForWebhook` returned `resolved`. */
    async captureSaasBillingProviderWebhookEvent(input: {
      organizationId: string;
      saasBillingInvoiceId: string;
      providerId: string;
      verified: Pick<
        PaymentProviderVerifyResult,
        'idempotencyKey' | 'eventType' | 'amountMinor' | 'payload'
      >;
    }): Promise<{ captured: boolean; duplicate: boolean }> {
      const payloadCurrency =
        typeof input.verified.payload.currency === 'string'
          ? input.verified.payload.currency
          : null;
      const { created } = await dependencies.repository.recordSaasBillingProviderEvent({
        organizationId: input.organizationId,
        saasBillingInvoiceId: input.saasBillingInvoiceId,
        event: {
          providerId: input.providerId,
          providerEventId: input.verified.idempotencyKey,
          type: input.verified.eventType,
          amountMinor: input.verified.amountMinor ?? null,
          currency: payloadCurrency,
        },
      });
      // Replay: the event row already exists — do not capture a second time.
      if (!created) return { captured: false, duplicate: true };

      if (input.verified.eventType !== 'payment.succeeded') {
        return { captured: false, duplicate: false };
      }
      const paidInvoice = await dependencies.repository.markSaasBillingInvoicePaid({
        saasBillingInvoiceId: input.saasBillingInvoiceId,
        organizationId: input.organizationId,
        paidAt: now().toISOString(),
      });
      // К4 — `null` means the invoice no longer matches a payable status: already `paid` (a replay
      // that slipped past the event-id dedup above under a different provider event id), or `void`
      // because a platform admin cancelled it. Either way this is a safe no-op, never a silent
      // "cancelled invoice just got paid" — the event is acknowledged, no subscription period moves.
      if (!paidInvoice) return { captured: false, duplicate: false };
      // §5a К0 — extends exactly the subscription row the invoice was raised against, by id; a
      // `manual` admin assignment lives under a different row (different `source`) and this update
      // never addresses it, so it cannot be silently overwritten by this capture.
      await dependencies.repository.activateSaasBillingSubscriptionPeriod({
        organizationId: input.organizationId,
        saasBillingSubscriptionId: paidInvoice.saasBillingSubscriptionId,
        periodStartsAt: paidInvoice.servicePeriodStartsAt,
        periodEndsAt: paidInvoice.servicePeriodEndsAt,
      });
      return { captured: true, duplicate: false };
    },

    /**
     * К2 — refund (full or partial) against a paid invoice. `requestKey` is caller-owned and
     * stable across a retried click (see `PlatformPaymentsSection.tsx`): the reservation
     * transaction inserts a `pending` row under a unique `(providerId, providerIdempotencyKey)`
     * key derived from it, so a second call with the same key returns the row the first call
     * already reserved instead of racing it into a second refund.
     */
    async refundSaasBillingInvoice(input: {
      saasBillingInvoiceId: string;
      amountMinor: number;
      requestKey: string;
      actorId: string | null;
      reason: string;
    }): Promise<
      | { outcome: 'invoice_not_found' }
      | { outcome: 'invoice_not_refundable'; status: SaasBillingInvoiceStatus }
      | { outcome: 'amount_exceeds_remaining'; remainingMinor: number }
      | { outcome: 'refunded'; refund: SaasBillingRefund; duplicate: boolean }
      | { outcome: 'provider_error' }
    > {
      if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
        throw new Error('refund_amount_must_be_positive_integer');
      }
      const providerIdempotencyKey = `saas_refund:${input.saasBillingInvoiceId}:${input.requestKey}`;
      const reservation = await dependencies.repository.reserveSaasBillingRefund({
        saasBillingInvoiceId: input.saasBillingInvoiceId,
        amountMinor: input.amountMinor,
        providerIdempotencyKey,
        audit: { actorId: input.actorId, reason: input.reason },
      });
      if (reservation.outcome === 'duplicate') {
        return { outcome: 'refunded', refund: reservation.refund, duplicate: true };
      }
      if (reservation.outcome !== 'reserved') {
        return reservation;
      }
      const { refund, invoice } = reservation;
      if (!invoice.providerInvoiceRef) {
        await dependencies.repository.markSaasBillingRefundFailed({
          saasBillingRefundId: refund.id,
        });
        return { outcome: 'provider_error' };
      }
      try {
        const provider = await resolvePaymentProvider(invoice.providerId);
        const result = await provider.adapter.refund({
          providerIntentRef: invoice.providerInvoiceRef,
          amountMinor: input.amountMinor,
          currency: invoice.currency,
          idempotencyKey: providerIdempotencyKey,
          providerConfig: provider.providerConfig,
        });
        const attached = await dependencies.repository.attachSaasBillingRefundProviderRef({
          saasBillingRefundId: refund.id,
          providerRefundRef: result.providerRefundRef,
        });
        return { outcome: 'refunded', refund: attached, duplicate: false };
      } catch {
        await dependencies.repository.markSaasBillingRefundFailed({
          saasBillingRefundId: refund.id,
        });
        return { outcome: 'provider_error' };
      }
    },

    /**
     * Unscoped by design, same shape as `resolveSaasBillingInvoiceForWebhook` — the webhook does
     * not know the organization until a refund with this `providerId`/refund ref is found.
     */
    async resolveSaasBillingRefundForWebhook(input: {
      providerId: string;
      verified: Pick<PaymentProviderVerifyResult, 'intentRef' | 'amountMinor' | 'payload'>;
    }): Promise<
      | { outcome: 'unknown_reference' }
      | { outcome: 'mismatch'; field: 'amount' }
      | {
          outcome: 'resolved';
          organizationId: string;
          saasBillingInvoiceId: string;
          saasBillingRefundId: string;
        }
    > {
      const providerRefundRef = input.verified.intentRef?.trim();
      if (!providerRefundRef) return { outcome: 'unknown_reference' };
      const refund = await dependencies.repository.findSaasBillingRefundByProviderRef({
        providerId: input.providerId,
        providerRefundRef,
      });
      if (!refund) return { outcome: 'unknown_reference' };
      if (
        input.verified.amountMinor !== undefined &&
        input.verified.amountMinor !== refund.amountMinor
      ) {
        return { outcome: 'mismatch', field: 'amount' };
      }
      return {
        outcome: 'resolved',
        organizationId: refund.organizationId,
        saasBillingInvoiceId: refund.saasBillingInvoiceId,
        saasBillingRefundId: refund.id,
      };
    },

    /** Org-scoped: call only after `resolveSaasBillingRefundForWebhook` returned `resolved`. */
    async captureSaasBillingRefundWebhookEvent(input: {
      organizationId: string;
      saasBillingInvoiceId: string;
      saasBillingRefundId: string;
      providerId: string;
      verified: Pick<
        PaymentProviderVerifyResult,
        'idempotencyKey' | 'eventType' | 'amountMinor' | 'payload'
      >;
    }): Promise<{ captured: boolean; duplicate: boolean }> {
      const payloadCurrency =
        typeof input.verified.payload.currency === 'string'
          ? input.verified.payload.currency
          : null;
      const { created } = await dependencies.repository.recordSaasBillingProviderEvent({
        organizationId: input.organizationId,
        saasBillingInvoiceId: input.saasBillingInvoiceId,
        event: {
          providerId: input.providerId,
          providerEventId: input.verified.idempotencyKey,
          type: input.verified.eventType,
          amountMinor: input.verified.amountMinor ?? null,
          currency: payloadCurrency,
        },
      });
      // Replay: the event row already exists — do not confirm a second time.
      if (!created) return { captured: false, duplicate: true };

      if (input.verified.eventType !== 'refund.succeeded') {
        return { captured: false, duplicate: false };
      }
      await dependencies.repository.confirmSaasBillingRefund({
        saasBillingRefundId: input.saasBillingRefundId,
        organizationId: input.organizationId,
        status: 'succeeded',
        confirmedAt: now().toISOString(),
      });
      return { captured: true, duplicate: false };
    },
  };
}

export type SaasBillingService = ReturnType<typeof createSaasBillingService>;
