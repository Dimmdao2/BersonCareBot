import { createHash } from 'node:crypto';
import {
  PaymentProviderRequestRefusedError,
  type PaymentProviderPort,
  type PaymentProviderVerifyResult,
} from '@/modules/payments/providerPort';
import type { TariffDowngradeBlock } from '@/modules/org-entitlements/service';
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
import { buildPartialRefundReceipt, buildSaasBillingReceipt } from './fiscalReceipt';
import { env } from '@/config/env';
import { routePaths } from '@/app-layer/routes/paths';

/**
 * B1.1 — the door's "куда вернуть" for every tariff payment: the settings screen holding the
 * "Оплатить тариф" button (`PayTariffButton.tsx`), whether the payer got there by clicking it (K0)
 * or is only seeing the resulting invoice later after an unattended autopay tick (К5).
 */
const SAAS_BILLING_RETURN_URL = `${env.APP_BASE_URL}${routePaths.settings}?tab=billing`;
const SAAS_SEAT_BILLING_RETURN_URL = `${env.APP_BASE_URL}${routePaths.settings}?tab=team`;

/**
 * §5a/2.1c — INVARIANT OF THE TWO MONEY FLOWS. The path by which a clinic pays US for its tariff is
 * untouched by the access ladder in every state, including the terminal cabinet block: otherwise the
 * block could not be lifted by paying and would be inescapable. Concretely, this module must never
 * gain a dependency on `org-entitlements` / `requireEntitlement`. That is enforced by
 * `service.test.ts` (§5a/2.1c suite), not by a runtime check here — a runtime check would be the
 * very coupling the invariant forbids.
 */

/**
 * К4 round 2 — the ONE place both `createManualSaasBillingInvoice` and
 * `createOwnTariffRenewalInvoice` derive their `providerIdempotencyKey` from, instead of each
 * minting a fresh `randomUUID()` per call. A key born from `randomUUID()` can never collide with
 * itself, so the DB's own unique index on `(providerId, providerIdempotencyKey)` — which exists
 * precisely to catch a duplicate — never fires: two clicks of the same form always looked like two
 * different requests. Hashing the REQUEST's own fields instead makes two identical requests hash
 * to the same key (repeat click is a no-op) and two deliberately different requests (different
 * amount, different clinic, ...) hash to different keys (both get created).
 */
function deriveSaasBillingIdempotencyKey(parts: ReadonlyArray<string | number>): string {
  return createHash('sha256').update(parts.map(String).join(' ')).digest('hex');
}

/** Structured refusal for the clinic UI; the schedule has no side effect when this is thrown. */
export class SaasBillingTariffDowngradeBlockedError extends Error {
  constructor(readonly blocks: TariffDowngradeBlock[]) {
    super('saas_billing_tariff_downgrade_blocked');
  }
}

type ManualAssignmentTransaction = Parameters<
  Parameters<SaasBillingRepositoryPort['runManualAssignmentTransaction']>[0]
>[0];

/**
 * #1069 T5 (owner 03.08): the one-time trial applies to the organization's FIRST tariff — assigned
 * by the platform or chosen by the clinic — not to every later tariff change.
 */
async function assignFirstTariffWithTrialIfEligible(input: {
  organizationId: string;
  tariffId: string;
  audit: { actorId: string | null; reason: string };
  state: Awaited<ReturnType<ManualAssignmentTransaction['loadManualAssignmentState']>>;
  transaction: ManualAssignmentTransaction;
}): Promise<{ created: boolean; endsAt: string } | null> {
  if (
    input.state.organization.tariffId !== null ||
    input.state.organizationTrialConsumed ||
    input.state.activeTrial
  ) {
    return null;
  }
  const policy = await input.transaction.getActiveTrialPolicy();
  if (!policy) return null;

  await input.transaction.updateOrganizationTariffAssignment({
    organizationId: input.organizationId,
    tariffId: input.tariffId,
  });
  const started = await input.transaction.startOrganizationTrial({
    organizationId: input.organizationId,
    tariffId: input.tariffId,
    policy,
    audit: input.audit,
  });
  await input.transaction.appendManualAssignmentAudit({
    ...input.audit,
    action: started.created ? 'saas_trial_start' : 'saas_tariff_assign',
    targetId: input.organizationId,
    organizationId: input.organizationId,
    before: {
      organization: input.state.organization,
      trial: input.state.activeTrial,
      saasBillingSubscription: input.state.manualSaasBillingSubscription,
    },
    after: { tariffId: input.tariffId, trial: started },
  });
  return started;
}

export function createSaasBillingService(dependencies: {
  repository: SaasBillingRepositoryPort;
  settings: SaasBillingSettingsReadPort;
  resolvePaymentProvider: SaasBillingPaymentProviderResolver;
  /** Injected so the paid period a test asserts is the one it set, not the wall clock. */
  now?: () => Date;
  getTariffTransition?: (
    organizationId: string,
    tariffId: string,
  ) => Promise<{
    currentTariffId: string | null;
    targetTariffId: string;
    blocks: TariffDowngradeBlock[];
    appliesNextPeriod: boolean;
    /** A live-price comparison is only a hint; the billing repository reclassifies against the paid snapshot. */
    priceAppliesNextPeriod?: true;
  }>;
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
    let adapter: PaymentProviderPort;
    try {
      adapter = dependencies.resolvePaymentProvider(providerConfig.id);
    } catch (error) {
      // A persisted provider id can outlive an adapter removal or TEST fixture.  This is an
      // unavailable platform payment store, not an invoice/DB failure; keep the route's honest
      // 503 contract instead of letting the registry's implementation error become a 500.
      if (
        error instanceof Error &&
        error.message === `unsupported_payment_provider:${providerConfig.id}`
      ) {
        throw new Error(`saas_billing_payment_provider_unavailable:${providerConfig.id}`);
      }
      throw error;
    }
    return {
      providerId: providerConfig.id,
      providerConfig,
      adapter,
      payeeRequisites: settings.payeeRequisites,
    };
  }

  /** Fiscal fields are opt-in, but a partially configured receipt must fail locally, not at the PSP. */
  async function attachFiscalReceiptIfConfigured(
    invoice: Awaited<
      ReturnType<typeof dependencies.repository.createSaasBillingInvoice>
    >['invoice'],
    payeeRequisites: ResolvedSaasBillingPaymentProvider['payeeRequisites'],
  ) {
    const fiscalReceiptConfigured = Boolean(
      payeeRequisites.vatCode || payeeRequisites.taxSystemCode,
    );
    if (!fiscalReceiptConfigured) return { invoice, receipt: undefined };
    if (!payeeRequisites.vatCode) {
      throw new Error('saas_billing_receipt_vat_code_missing');
    }
    const billingEmail = await dependencies.repository.getSaasBillingAccountBillingEmail(
      invoice.organizationId,
    );
    const receipt = buildSaasBillingReceipt(invoice, billingEmail, payeeRequisites);
    return {
      invoice: await dependencies.repository.attachSaasBillingInvoiceReceiptSnapshot({
        saasBillingInvoiceId: invoice.id,
        receipt,
      }),
      receipt,
    };
  }

  async function createRenewalSaasBillingInvoice(input: {
    organizationId: string;
    saasBillingSubscriptionId: string;
    servicePeriodStartsAt: string;
    servicePeriodEndsAt: string;
    providerIdempotencyKey: string;
    /** К6 — request the provider save this payment's method; only meaningful while none is saved yet. */
    savePaymentMethod?: boolean;
    /** К6 — a failed off-session attempt reuses its period row, but opens a fresh manual checkout. */
    retryFailedManually?: boolean;
  }) {
    const provider = await resolvePaymentProvider();
    const { invoice, created } = await dependencies.repository.createSaasBillingInvoice({
      organizationId: input.organizationId,
      saasBillingSubscriptionId: input.saasBillingSubscriptionId,
      servicePeriodStartsAt: input.servicePeriodStartsAt,
      servicePeriodEndsAt: input.servicePeriodEndsAt,
      providerIdempotencyKey: input.providerIdempotencyKey,
      providerId: provider.providerId,
    });
    if (!created && invoice.providerCheckoutUrl) return invoice;
    let checkoutInvoice = invoice;
    if (!created && input.retryFailedManually) {
      if (invoice.status === 'failed') {
        checkoutInvoice = await dependencies.repository.prepareSaasBillingFailedInvoiceForManualCheckout({
          saasBillingInvoiceId: invoice.id,
          organizationId: input.organizationId,
          providerId: provider.providerId,
          // A canceled provider payment must never be retried under its old idempotency key: the
          // PSP would correctly return that same canceled attempt forever. The invoice id plus its
          // previous key advances once per failed attempt, while concurrent clicks converge on the
          // same new key and therefore cannot charge twice.
          providerIdempotencyKey: `saas_tariff_manual_retry:${deriveSaasBillingIdempotencyKey([
            invoice.id,
            invoice.providerIdempotencyKey,
            ])}`,
        });
        if (
          checkoutInvoice.status !== 'draft' ||
          checkoutInvoice.providerCheckoutUrl ||
          !checkoutInvoice.providerIdempotencyKey.startsWith('saas_tariff_manual_retry:')
        ) {
          return checkoutInvoice;
        }
      } else if (checkoutInvoice.status !== 'draft' || checkoutInvoice.providerCheckoutUrl) {
        return checkoutInvoice;
      }
    }
    const claimed =
      (await dependencies.repository.claimSaasBillingInvoiceProviderIntent?.(checkoutInvoice.id)) ??
      (created || checkoutInvoice.status === 'draft');
    if (!claimed) return checkoutInvoice;
    try {
      const fiscalized = await attachFiscalReceiptIfConfigured(
        checkoutInvoice,
        provider.payeeRequisites,
      );
      const intent = await provider.adapter.createIntent({
        amountMinor: fiscalized.invoice.amountMinor,
        currency: fiscalized.invoice.currency,
        idempotencyKey: fiscalized.invoice.providerIdempotencyKey,
        payerRef: `organization:${checkoutInvoice.organizationId}`,
        purpose: 'saas_billing_tariff_renewal',
        subjectRef: checkoutInvoice.id,
        returnUrl: SAAS_BILLING_RETURN_URL,
        metadata: {
          organizationId: checkoutInvoice.organizationId,
          saasBillingInvoiceId: checkoutInvoice.id,
          saasBillingSubscriptionId: checkoutInvoice.saasBillingSubscriptionId,
        },
        providerConfig: provider.providerConfig,
        savePaymentMethod: input.savePaymentMethod,
        receipt: fiscalized.receipt,
      });
      return await dependencies.repository.attachSaasBillingInvoiceProviderIntent({
        saasBillingInvoiceId: checkoutInvoice.id,
        providerInvoiceRef: intent.providerIntentRef,
        providerCheckoutUrl: intent.checkoutUrl ?? null,
      });
    } catch (error) {
      await dependencies.repository.releaseSaasBillingInvoiceProviderIntent?.({
        saasBillingInvoiceId: checkoutInvoice.id,
        // B0.3 — a refusal PROVEN before creation must not leave the next attempt resending a
        // burned key; an ambiguous failure (network/timeout/5xx) must, so it safely replays instead
        // of risking a double charge. Same deterministic derivation the manual-retry path uses, so
        // concurrent retries converge on one new key rather than racing to different ones.
        rotateProviderIdempotencyKeyTo:
          error instanceof PaymentProviderRequestRefusedError
            ? `saas_tariff_refused_retry:${deriveSaasBillingIdempotencyKey([
                checkoutInvoice.id,
                checkoutInvoice.providerIdempotencyKey,
              ])}`
            : undefined,
      });
      throw error;
    }
  }

  async function createProratedTariffUpgradeCheckout(input: {
    organizationId: string;
    saasBillingSubscriptionId: string;
    targetTariffId: string;
    currentPeriodStartsAt: string;
  }) {
    const provider = await resolvePaymentProvider();
    const result = await dependencies.repository.createProratedTariffUpgradeInvoice({
      organizationId: input.organizationId,
      saasBillingSubscriptionId: input.saasBillingSubscriptionId,
      targetTariffId: input.targetTariffId,
      asOf: now().toISOString(),
      providerId: provider.providerId,
      providerIdempotencyKey: `saas_tariff_upgrade:${deriveSaasBillingIdempotencyKey([
        input.organizationId,
        input.saasBillingSubscriptionId,
        input.targetTariffId,
        input.currentPeriodStartsAt,
      ])}`,
    });
    if (result.outcome === 'scheduled') return null;
    const { invoice, created } = result;
    // B0.3 — `providerCheckoutUrl` is written once and never cleared, so its mere presence says
    // nothing about whether the PSP will still accept a payment against it. `status` is the field
    // the provider's own webhooks (capture/fail) and an admin cancel actually drive, so it is the
    // authoritative "is this order still open" signal we have; `draft`/`pending` are the only
    // states in which the checkout link we handed out can still be paid.
    const invoiceStillPayable = invoice.status === 'draft' || invoice.status === 'pending';
    if (!created && invoiceStillPayable && invoice.providerCheckoutUrl) return invoice;
    let checkoutInvoice = invoice;
    // `failed` (the PSP closed the order, e.g. it expired/was declined) and `void` (an operator
    // cancelled a stuck invoice, `POST /api/admin/saas-billing/payments/{id}/cancel`) both leave a
    // dead checkout URL behind under the SAME deterministic idempotency key — a repeat upgrade to
    // this tariff must reopen the row for a fresh provider order, never hand back that dead link.
    // `paid` is deliberately excluded: a genuinely paid invoice must never be reopened.
    if (!created && (invoice.status === 'failed' || invoice.status === 'void')) {
      checkoutInvoice = await dependencies.repository.prepareSaasBillingFailedInvoiceForManualCheckout({
        saasBillingInvoiceId: invoice.id,
        organizationId: input.organizationId,
        providerId: provider.providerId,
        providerIdempotencyKey: `saas_tariff_upgrade_retry:${deriveSaasBillingIdempotencyKey([
          invoice.id,
          invoice.providerIdempotencyKey,
        ])}`,
      });
    }
    const claimed =
      (await dependencies.repository.claimSaasBillingInvoiceProviderIntent?.(checkoutInvoice.id)) ??
      (created || checkoutInvoice.status === 'draft');
    if (!claimed) return checkoutInvoice;
    try {
      const fiscalized = await attachFiscalReceiptIfConfigured(
        checkoutInvoice,
        provider.payeeRequisites,
      );
      const intent = await provider.adapter.createIntent({
        amountMinor: fiscalized.invoice.amountMinor,
        currency: fiscalized.invoice.currency,
        idempotencyKey: fiscalized.invoice.providerIdempotencyKey,
        payerRef: `organization:${checkoutInvoice.organizationId}`,
        purpose: 'saas_billing_tariff_renewal',
        subjectRef: checkoutInvoice.id,
        returnUrl: SAAS_BILLING_RETURN_URL,
        metadata: {
          organizationId: checkoutInvoice.organizationId,
          saasBillingInvoiceId: checkoutInvoice.id,
          saasBillingSubscriptionId: checkoutInvoice.saasBillingSubscriptionId,
        },
        providerConfig: provider.providerConfig,
        receipt: fiscalized.receipt,
      });
      return await dependencies.repository.attachSaasBillingInvoiceProviderIntent({
        saasBillingInvoiceId: checkoutInvoice.id,
        providerInvoiceRef: intent.providerIntentRef,
        providerCheckoutUrl: intent.checkoutUrl ?? null,
      });
    } catch (error) {
      await dependencies.repository.releaseSaasBillingInvoiceProviderIntent?.({
        saasBillingInvoiceId: checkoutInvoice.id,
      });
      throw error;
    }
  }

  /**
   * К4 — platform-admin-issued invoice for the organization's OWN currently assigned tariff. The
   * invoice format is an adapter detail behind `createIntent`, never a second payment entrance.
   * Amount/description/expiry are admin-chosen; the tariff, subscription and resulting service
   * period are server-resolved from the organization's existing assignment, same authority K0 uses.
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
    if (!provider.adapter.supportsInvoice) {
      throw new Error(`saas_billing_provider_invoices_unsupported:${provider.providerId}`);
    }

    // Deterministic, not `randomUUID()`: the same (org, amount, currency, description, expiry)
    // submitted twice hashes to the same key, so the DB's unique index on
    // `(providerId, providerIdempotencyKey)` catches the repeat below; a deliberately different
    // request (different amount, different clinic, ...) hashes to a different key and is created.
    const providerIdempotencyKey = `saas_manual_invoice:${deriveSaasBillingIdempotencyKey([
      input.organizationId,
      input.amountMinor,
      input.currency,
      description,
      input.expiresAt,
    ])}`;

    const { invoice, created: wasCreated } =
      await dependencies.repository.createManualSaasBillingInvoice({
        organizationId: input.organizationId,
        saasBillingSubscriptionId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        description,
        servicePeriodStartsAt,
        servicePeriodEndsAt,
        expiresAt: input.expiresAt,
        providerId: provider.providerId,
        providerIdempotencyKey,
        invoiceKind: 'tariff_period',
        additionalSeatQuantity: 0,
      });
    if (!wasCreated && invoice.providerCheckoutUrl) return invoice;
    const claimed =
      (await dependencies.repository.claimSaasBillingInvoiceProviderIntent?.(invoice.id)) ??
      (wasCreated || invoice.status === 'draft');
    if (!claimed) return invoice;

    try {
      const fiscalized = await attachFiscalReceiptIfConfigured(invoice, provider.payeeRequisites);
      const intent = await provider.adapter.createIntent({
      amountMinor: fiscalized.invoice.amountMinor,
      currency: fiscalized.invoice.currency,
      idempotencyKey: fiscalized.invoice.providerIdempotencyKey,
      payerRef: `organization:${invoice.organizationId}`,
      purpose: 'saas_billing_tariff_renewal',
      subjectRef: invoice.id,
      returnUrl: SAAS_BILLING_RETURN_URL,
      invoice: { description, expiresAt: input.expiresAt },
      metadata: {
        organizationId: invoice.organizationId,
        saasBillingInvoiceId: invoice.id,
        saasBillingSubscriptionId: invoice.saasBillingSubscriptionId,
      },
      providerConfig: provider.providerConfig,
      receipt: fiscalized.receipt,
      });

      return await dependencies.repository.attachSaasBillingInvoiceProviderIntent({
        saasBillingInvoiceId: invoice.id,
        providerInvoiceRef: intent.providerIntentRef,
        providerCheckoutUrl: intent.checkoutUrl ?? null,
      });
    } catch (error) {
      await dependencies.repository.releaseSaasBillingInvoiceProviderIntent?.({
        saasBillingInvoiceId: invoice.id,
      });
      throw error;
    }
  }

  async function purchaseSeatOverage(input: {
    organizationId: string;
    requestKey: string;
    confirmedAmountMinor: number;
    confirmedCurrency: string;
  }) {
    const subscription = await dependencies.repository.requireOwnTariffBillingSubscription(
      input.organizationId,
    );
    const provider = await resolvePaymentProvider();
    const periodStart = now().toISOString();
    const result = await dependencies.repository.createSeatOverageInvoiceIfNeeded({
      organizationId: input.organizationId,
      saasBillingSubscriptionId: subscription.saasBillingSubscriptionId,
      confirmedAmountMinor: input.confirmedAmountMinor,
      confirmedCurrency: input.confirmedCurrency,
      providerId: provider.providerId,
      providerIdempotencyKey: `saas_seat_overage:${input.organizationId}:${input.requestKey}`,
      servicePeriodStartsAt: periodStart,
      servicePeriodEndsAt: paidPeriodEndsAt(periodStart, subscription.billingPeriod),
    });
    if (result.outcome !== 'invoice') return result;
    if (result.invoice.providerCheckoutUrl) {
      return { outcome: 'checkout' as const, invoice: result.invoice };
    }

    const returnUrl = new URL(SAAS_SEAT_BILLING_RETURN_URL);
    returnUrl.searchParams.set('seatPayment', result.invoice.id);
    const fiscalized = await attachFiscalReceiptIfConfigured(
      result.invoice,
      provider.payeeRequisites,
    );
    const intent = await provider.adapter.createIntent({
      amountMinor: fiscalized.invoice.amountMinor,
      currency: fiscalized.invoice.currency,
      idempotencyKey: fiscalized.invoice.providerIdempotencyKey,
      payerRef: `organization:${input.organizationId}`,
      purpose: 'saas_billing_seat_overage',
      subjectRef: result.invoice.id,
      returnUrl: returnUrl.toString(),
      metadata: {
        organizationId: input.organizationId,
        saasBillingInvoiceId: result.invoice.id,
        saasBillingSubscriptionId: subscription.saasBillingSubscriptionId,
      },
      providerConfig: provider.providerConfig,
      receipt: fiscalized.receipt,
    });
    const invoice = await dependencies.repository.attachSaasBillingInvoiceProviderIntent({
      saasBillingInvoiceId: result.invoice.id,
      providerInvoiceRef: intent.providerIntentRef,
      providerCheckoutUrl: intent.checkoutUrl ?? null,
    });
    return { outcome: 'checkout' as const, invoice };
  }

  return {
    getOrganizationBillingOverview(organizationId: string) {
      return dependencies.repository.getOrganizationBillingOverview(organizationId);
    },

    updateOwnBillingEmail(input: { organizationId: string; billingEmail: string }) {
      return dependencies.repository.updateSaasBillingAccountBillingEmail(input);
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
      /** A restrictive switch preserves the already paid access until `currentPeriodEndsAt`. */
      applyAtNextPeriod?: boolean;
      scheduleOnly?: boolean;
      audit: { actorId: string | null; reason: string };
    }) {
      return dependencies.repository.runManualAssignmentTransaction(async (transaction) => {
        const state = await transaction.loadManualAssignmentState(input.organizationId);
        const currentManualTariffId =
          state.manualSaasBillingSubscription?.status === 'active'
            ? state.manualSaasBillingSubscription.tariffId
            : null;
        const activePaidPeriod =
          state.manualSaasBillingSubscription?.status === 'active' &&
          state.manualSaasBillingSubscription.currentPeriodEndsAt !== null &&
          new Date(state.manualSaasBillingSubscription.currentPeriodEndsAt).getTime() > now().getTime();
        if (input.tariffId === currentManualTariffId && !state.activeTrial) {
          if (state.manualSaasBillingSubscription?.pendingTariffId) {
            await transaction.setManualSaasBillingSubscription({
              organizationId: input.organizationId,
              tariffId: currentManualTariffId,
              period: activePaidPeriod
                ? {
                    startsAt: state.manualSaasBillingSubscription.currentPeriodStartsAt as string,
                    endsAt: state.manualSaasBillingSubscription.currentPeriodEndsAt as string,
                  }
                : null,
              pendingTariffId: null,
              preservePeriodSnapshot: input.scheduleOnly,
            });
            await transaction.appendManualAssignmentAudit({
              ...input.audit,
              action: 'saas_tariff_change_cancelled',
              targetId: input.organizationId,
              organizationId: input.organizationId,
              before: { organization: state.organization, saasBillingSubscription: state.manualSaasBillingSubscription },
              after: { pendingTariffId: null },
            });
          }
          return;
        }

        if (input.tariffId && input.applyAtNextPeriod && activePaidPeriod && currentManualTariffId) {
          const currentSubscription = state.manualSaasBillingSubscription;
          if (!currentSubscription) throw new Error('saas_billing_subscription_not_found');
          await transaction.setManualSaasBillingSubscription({
            organizationId: input.organizationId,
            tariffId: currentManualTariffId,
            period: {
              startsAt: currentSubscription.currentPeriodStartsAt as string,
              endsAt: currentSubscription.currentPeriodEndsAt as string,
            },
            pendingTariffId: input.tariffId,
            preservePeriodSnapshot: input.scheduleOnly,
          });
          await transaction.appendManualAssignmentAudit({
            ...input.audit,
            action: 'saas_tariff_downgrade_scheduled',
            targetId: input.organizationId,
            organizationId: input.organizationId,
            before: { organization: state.organization, saasBillingSubscription: state.manualSaasBillingSubscription },
            after: { pendingTariffId: input.tariffId },
          });
          return;
        }

        if (input.scheduleOnly) throw new Error('saas_billing_no_active_paid_subscription');

        // #1069 T5 (owner 03.08): first tariff attachment (auto or chosen) starts the one-time trial
        // when policy is active; paid period opens only after the trial identity is consumed.
        if (input.tariffId && !input.applyAtNextPeriod) {
          const trialStarted = await assignFirstTariffWithTrialIfEligible({
            organizationId: input.organizationId,
            tariffId: input.tariffId,
            audit: input.audit,
            state,
            transaction,
          });
          if (trialStarted) return;
        }

        // §5a item 7.0 — assignment is what STARTS the organization's paid period. Before this the
        // subscription row carried no period at all, so "период кончился и не оплачен" was a state
        // the product could not reach and the ladder had nothing but an expired trial to run on.
        // The length is the owner's `billing_period` on the tariff, never a number chosen here.
        const startsAt = now().toISOString();
        const period = input.tariffId
          ? {
              ...(activePaidPeriod
                ? {
                    startsAt: state.manualSaasBillingSubscription?.currentPeriodStartsAt as string,
                    endsAt: state.manualSaasBillingSubscription?.currentPeriodEndsAt as string,
                  }
                : {
                    startsAt,
                    endsAt: paidPeriodEndsAt(
                      startsAt,
                      (await transaction.requireActiveTariff(input.tariffId)).billingPeriod,
                    ),
                  }),
            }
          : null;
        await transaction.setManualSaasBillingSubscription({
          organizationId: input.organizationId,
          tariffId: input.tariffId,
          period,
          pendingTariffId: null,
        });
        const organization = await transaction.updateOrganizationTariffAssignment({
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
    purchaseSeatOverage,

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
        if (
          await dependencies.repository.promoteDueSaasBillingPaidInvoice({
            organizationId: subscription.organizationId,
            saasBillingSubscriptionId: subscription.saasBillingSubscriptionId,
            asOf,
          })
        ) {
          alreadyInvoiced += 1;
          continue;
        }
        // §5a item 7.0 arithmetic: the new period starts exactly where the paid one ended, never
        // "now" — a late tick must not hand the clinic extra free days.
        const servicePeriodStartsAt = subscription.currentPeriodEndsAt;
        const servicePeriodEndsAt = paidPeriodEndsAt(
          servicePeriodStartsAt,
          subscription.billingPeriod,
        );
        // К6 — the money-safety gate: BOTH an active, unrevoked consent AND a saved method must
        // hold. A revoked consent must win even if `savedPaymentMethodId` is still on the row (we
        // deliberately never clear it on revoke) — this is exactly what keeps a revoke effective
        // immediately, tested in service.test.ts.
        const autopayActive =
          subscription.autopayConsentedAt !== null &&
          subscription.autopayRevokedAt === null &&
          subscription.savedPaymentMethodId !== null;
        let invoiceIdForFailureReport: string | undefined;
        try {
          if (subscription.pendingTariffId) {
            if (!dependencies.getTariffTransition) {
              throw new Error('saas_billing_tariff_change_unavailable');
            }
            const transition = await dependencies.getTariffTransition(
              subscription.organizationId,
              subscription.pendingTariffId,
            );
            if (transition.blocks.length > 0) {
              throw new SaasBillingTariffDowngradeBlockedError(transition.blocks);
            }
          }
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
          invoiceIdForFailureReport = invoice.id;
          const fiscalized = await attachFiscalReceiptIfConfigured(
            invoice,
            provider.payeeRequisites,
          );
          const intent = await provider.adapter.createIntent({
            amountMinor: fiscalized.invoice.amountMinor,
            currency: fiscalized.invoice.currency,
            idempotencyKey: fiscalized.invoice.providerIdempotencyKey,
            payerRef: `organization:${invoice.organizationId}`,
            purpose: 'saas_billing_tariff_renewal',
            subjectRef: invoice.id,
            returnUrl: SAAS_BILLING_RETURN_URL,
            metadata: {
              organizationId: invoice.organizationId,
              saasBillingInvoiceId: invoice.id,
              saasBillingSubscriptionId: invoice.saasBillingSubscriptionId,
            },
            providerConfig: provider.providerConfig,
            paymentMethodId: autopayActive ? (subscription.savedPaymentMethodId ?? undefined) : undefined,
            receipt: fiscalized.receipt,
          });
          await dependencies.repository.attachSaasBillingInvoiceProviderIntent({
            saasBillingInvoiceId: invoice.id,
            providerInvoiceRef: intent.providerIntentRef,
            providerCheckoutUrl: intent.checkoutUrl ?? null,
          });
          created += 1;
        } catch (error) {
          failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          errors.push({
            organizationId: subscription.organizationId,
            saasBillingSubscriptionId: subscription.saasBillingSubscriptionId,
            error: message,
          });
          // К6 — an off-session charge attempt that the provider rejected must not sit in `draft`
          // forever: flip it to `failed`, visible in the clinic's billing screen as "Ошибка
          // оплаты" (`SaasBillingOverview.tsx`) with the existing "Оплатить тариф" button as the
          // next step — never let this fail the whole tick over one organization.
          if (autopayActive && invoiceIdForFailureReport) {
            await dependencies.repository
              .markSaasBillingInvoiceFailed({
                saasBillingInvoiceId: invoiceIdForFailureReport,
                organizationId: subscription.organizationId,
              })
              .catch(() => null);
          }
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
      const {
        saasBillingSubscriptionId,
        currentTariffId,
        tariffId,
        billingPeriod,
        savedPaymentMethodId,
        currentPeriodEndsAt,
      } = await dependencies.repository.requireOwnTariffBillingSubscription(organizationId);
      // A normal renewal pays the tariff already assigned to this clinic.  Its route runs under
      // the clinic-billing principal and must not enter the platform-only transition port.  A
      // scheduled next tariff is different: retain the downgrade recheck before selling that
      // next period.
      if (dependencies.getTariffTransition && currentTariffId !== tariffId) {
        const transition = await dependencies.getTariffTransition(organizationId, tariffId);
        if (transition.blocks.length > 0) throw new Error('saas_billing_tariff_downgrade_blocked');
      }
      // A clinic can pay before expiry. The purchased next period begins at the paid boundary,
      // never at the click time, otherwise an early renewal silently cuts off paid days.
      const servicePeriodStartsAt = currentPeriodEndsAt ?? now().toISOString();
      const servicePeriodEndsAt = paidPeriodEndsAt(servicePeriodStartsAt, billingPeriod);
      // The tariff period itself is the request identity. Time spent on the same checkout must not
      // mint another logical invoice key; a later period has different service boundaries and so
      // naturally receives a different key.
      return createRenewalSaasBillingInvoice({
        organizationId,
        saasBillingSubscriptionId,
        servicePeriodStartsAt,
        servicePeriodEndsAt,
        // К6 — asked once, automatically, until the organization has a saved method; asking again
        // once one exists would be pointless (the provider already has one to reuse for autopay).
        savePaymentMethod: !savedPaymentMethodId,
        retryFailedManually: true,
        providerIdempotencyKey: `saas_tariff_renewal:${deriveSaasBillingIdempotencyKey([
          organizationId,
          saasBillingSubscriptionId,
          servicePeriodStartsAt,
          servicePeriodEndsAt,
        ])}`,
      });
    },

    async getOwnTariffChangeState(organizationId: string) {
      const overview = await dependencies.repository.getOrganizationBillingOverview(organizationId);
      const subscription = overview.subscriptions.find((row) => row.source === 'paid_subscription') ?? null;
      const assignedTariffId =
        await dependencies.repository.getOrganizationAssignedTariffId(organizationId);
      return {
        choices: await dependencies.repository.listActiveTariffChoices(),
        currentTariffId: subscription?.tariffId ?? assignedTariffId,
        pendingTariffId: subscription?.pendingTariffId ?? null,
        pendingEffectiveAt: subscription?.pendingTariffId ? subscription.currentPeriodEndsAt : null,
      };
    },

    async scheduleOwnTariffChange(input: {
      organizationId: string;
      tariffId: string;
      actorId: string | null;
    }) {
      if (!dependencies.getTariffTransition) throw new Error('saas_billing_tariff_change_unavailable');
      const transition = await dependencies.getTariffTransition(input.organizationId, input.tariffId);
      if (transition.currentTariffId === null) {
        const chosen = await dependencies.repository.chooseOrganizationFirstTariff({
          organizationId: input.organizationId,
          tariffId: input.tariffId,
          actorId: input.actorId,
        });
        if (chosen.outcome === 'trial_started') {
          return { outcome: 'trial_started' as const, endsAt: chosen.endsAt };
        }
        const invoice = await this.createOwnTariffRenewalInvoice(input.organizationId);
        if (!invoice.providerCheckoutUrl) {
          throw new Error('saas_billing_checkout_unavailable');
        }
        return { outcome: 'checkout' as const, invoice };
      }
      if (transition.currentTariffId === input.tariffId) {
        await this.assignManualTariff({
          organizationId: input.organizationId,
          tariffId: input.tariffId,
          applyAtNextPeriod: true,
          scheduleOnly: true,
          audit: { actorId: input.actorId, reason: 'clinic_tariff_change_cancelled' },
        });
        return { outcome: 'cancelled' as const };
      }
      if (!transition.appliesNextPeriod || transition.priceAppliesNextPeriod) {
        const subscription = await dependencies.repository.requireOwnTariffBillingSubscription(
          input.organizationId,
        );
        if (!subscription.currentPeriodStartsAt || !subscription.currentPeriodEndsAt) {
          throw new Error('saas_billing_no_active_paid_subscription');
        }
        const invoice = await createProratedTariffUpgradeCheckout({
          organizationId: input.organizationId,
          saasBillingSubscriptionId: subscription.saasBillingSubscriptionId,
          targetTariffId: transition.targetTariffId,
          currentPeriodStartsAt: subscription.currentPeriodStartsAt,
        });
        if (invoice) {
          return { outcome: 'checkout' as const, invoice };
        }
      }
      if (transition.blocks.length > 0) {
        throw new SaasBillingTariffDowngradeBlockedError(transition.blocks);
      }
      await this.assignManualTariff({
        organizationId: input.organizationId,
        tariffId: input.tariffId,
        applyAtNextPeriod: true,
        scheduleOnly: true,
        audit: { actorId: input.actorId, reason: 'clinic_tariff_downgrade_scheduled' },
      });
      return { outcome: 'scheduled' as const };
    },

    async cancelOwnTariffChange(input: { organizationId: string; actorId: string | null }) {
      const overview = await dependencies.repository.getOrganizationBillingOverview(input.organizationId);
      const subscription = overview.subscriptions.find((row) => row.source === 'paid_subscription');
      if (!subscription) throw new Error('saas_billing_no_active_paid_subscription');
      await this.assignManualTariff({
        organizationId: input.organizationId,
        tariffId: subscription.tariffId,
        applyAtNextPeriod: true,
        scheduleOnly: true,
        audit: { actorId: input.actorId, reason: 'clinic_tariff_change_cancelled' },
      });
    },

    /**
     * К6 — explicit opt-in to off-session autopay for the organization's OWN tariff subscription.
     * `consentText` must be `AUTOPAY_CONSENT_TEXT` (the route enforces this — the server, never the
     * client, decides what "the text the payer saw" is). Requires the `paid_subscription` row to
     * already exist (created lazily by `requireOwnTariffBillingSubscription`, same as every other
     * write against it) — thrown as `saas_billing_no_tariff_assigned` for consistency with the
     * pay-flow's own error when there is truly nothing to consent to yet.
     */
    async grantAutopayConsent(input: { organizationId: string; consentText: string }) {
      await dependencies.repository.requireOwnTariffBillingSubscription(input.organizationId);
      const result = await dependencies.repository.grantSaasBillingAutopayConsent({
        organizationId: input.organizationId,
        consentText: input.consentText,
        consentedAt: now().toISOString(),
      });
      if (result.outcome === 'no_subscription') {
        throw new Error('saas_billing_no_tariff_assigned');
      }
    },

    /** К6 — takes effect immediately: the very next renewal tick reads `autopayRevokedAt` fresh, not a cached flag. */
    async revokeAutopayConsent(input: { organizationId: string }) {
      await dependencies.repository.revokeSaasBillingAutopayConsent({
        organizationId: input.organizationId,
        revokedAt: now().toISOString(),
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
        'idempotencyKey' | 'eventType' | 'amountMinor' | 'payload' | 'savedPaymentMethodId'
      >;
    }): Promise<{ captured: boolean; duplicate: boolean }> {
      const payloadCurrency =
        typeof input.verified.payload.currency === 'string'
          ? input.verified.payload.currency
          : null;
      if (input.verified.eventType !== 'payment.succeeded') {
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
        // YooKassa may accept the off-session request first and only later notify us that the
        // payment was canceled. Without this transition the invoice remains `pending`, while the
        // period uniqueness guard then prevents the clinic's existing manual-payment button from
        // opening a usable checkout.
        if (input.verified.eventType === 'payment.canceled') {
          await dependencies.repository.markSaasBillingInvoiceFailed({
            saasBillingInvoiceId: input.saasBillingInvoiceId,
            organizationId: input.organizationId,
          });
        }
        return { captured: false, duplicate: !created };
      }
      return dependencies.repository.captureSaasBillingPaymentSucceeded({
        organizationId: input.organizationId,
        saasBillingInvoiceId: input.saasBillingInvoiceId,
        paidAt: now().toISOString(),
        savedPaymentMethodId: input.verified.savedPaymentMethodId ?? null,
        event: {
          providerId: input.providerId,
          providerEventId: input.verified.idempotencyKey,
          type: input.verified.eventType,
          amountMinor: input.verified.amountMinor ?? null,
          currency: payloadCurrency,
        },
      });
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
      | { outcome: 'seat_overage_partial_refund_forbidden' }
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
        const receipt =
          input.amountMinor < invoice.amountMinor
            ? buildPartialRefundReceipt(invoice, input.amountMinor)
            : undefined;
        const result = await provider.adapter.refund({
          providerIntentRef: invoice.providerInvoiceRef,
          amountMinor: input.amountMinor,
          currency: invoice.currency,
          idempotencyKey: providerIdempotencyKey,
          providerConfig: provider.providerConfig,
          receipt,
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
