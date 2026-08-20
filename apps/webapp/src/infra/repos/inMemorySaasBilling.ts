import type {
  SaasBillingInvoice,
  SaasBillingPlatformCurrencySummary,
  SaasBillingProviderEventReadRow,
  SaasBillingRefund,
  SaasBillingRepositoryPort,
  SaasBillingSubscription,
  TariffBillingPeriodCode,
} from '@/modules/saas-billing/ports';
import { withReceiptSnapshot } from '@/modules/saas-billing/fiscalReceipt';
import { purchasedTariffId } from '@/modules/saas-billing/payableTariff';
import {
  carriedSeatDebtMinor,
  proratedRemainingPeriodAmountMinor,
} from '@/modules/saas-billing/proration';
import { decideSeatOverage } from '@/modules/saas-billing/seatOverage';
import {
  reissueWithSuccessor,
  saasBillingInvoiceCancelVerdict,
  captureSaasBillingPaidInvoice,
} from '@/modules/saas-billing/invoiceOperations';
import { saasBillingInvoiceExpiresAt } from '@/modules/saas-billing/invoiceValidity';
import { isSaasBillingSeatDebtForPeriod } from '@/modules/saas-billing/seatDebt';
import { SAAS_BILLING_TARIFF_UPGRADE_DESCRIPTION } from '@/modules/saas-billing/ports';
import type { BillingPeriodOption } from '@/modules/saas-billing/billingPeriodCatalog';

const DEFAULT_BILLING_PERIODS: BillingPeriodOption[] = [
  { code: 'month', label: 'Месяц', months: 1, isSelectable: true, sortOrder: 10 },
  { code: 'half_year', label: 'Полгода', months: 6, isSelectable: true, sortOrder: 20 },
  { code: 'year', label: 'Год', months: 12, isSelectable: true, sortOrder: 30 },
];

function paidPeriodSnapshotPrice(snapshot: Record<string, unknown> | null): {
  priceMinor: number;
  currency: string;
  billingPeriod: string;
} {
  const priceMinor = snapshot?.price_minor;
  const currency = snapshot?.currency;
  const billingPeriod = snapshot?.billing_period;
  if (
    typeof priceMinor !== 'number' ||
    !Number.isSafeInteger(priceMinor) ||
    typeof currency !== 'string' ||
    !/^[A-Z]{3}$/.test(currency) ||
    typeof billingPeriod !== 'string' ||
    billingPeriod.trim().length === 0
  ) {
    throw new Error('saas_billing_paid_period_snapshot_missing');
  }
  return { priceMinor, currency, billingPeriod };
}

function paidPeriodSnapshotAdditionalSeatPrice(snapshot: Record<string, unknown> | null): number | null {
  const additionalSeatPriceMinor = snapshot?.additional_seat_price_minor;
  if (additionalSeatPriceMinor === null || additionalSeatPriceMinor === undefined) return null;
  if (
    typeof additionalSeatPriceMinor !== 'number' ||
    !Number.isSafeInteger(additionalSeatPriceMinor) ||
    additionalSeatPriceMinor < 0
  ) {
    throw new Error('saas_billing_paid_period_snapshot_missing');
  }
  return additionalSeatPriceMinor;
}

const OPEN_REFUND_STATUSES: SaasBillingRefund['status'][] = ['pending', 'succeeded'];

/** Key = `${organizationId}::${source}` — mirrors the real `(organization_id, source)` unique index,
 *  so `manual` and `paid_subscription` rows for the same org never collide in this fake. */
function subscriptionKey(
  organizationId: string,
  source: SaasBillingSubscription['source'],
): string {
  return `${organizationId}::${source}`;
}

export function createInMemorySaasBillingRepository(
  input: {
    tariffs?: Array<{
      id: string;
      name: string;
      priceMinor: number;
      currency: string;
      billingPeriod: string;
      additionalSeatPriceMinor?: number | null;
    }>;
    trialPolicy?: {
      durationDays: number;
      discountWindowDays: number;
      postTrialBehavior: string;
      postTrialTariffId: string | null;
    } | null;
    /**
     * Часы двойника. Нужны с тех пор, как момент продажи места определяет сам репозиторий, а не
     * сценарий: без общих часов сценарный тест с подменённым временем спрашивал бы у двойника
     * настоящее «сейчас» и получал цену другого дня.
     */
    now?: () => Date;
  } = {},
): SaasBillingRepositoryPort {
  const now = input.now ?? (() => new Date());
  const rows = new Map<string, SaasBillingSubscription>();
  const organizationTariffs = new Map<string, string | null>();
  const organizationTrials = new Map<
    string,
    { id: string; tariffId: string; status: 'active' | 'ended'; endsAt: string }
  >();
  const trialPolicy = input.trialPolicy ?? null;
  const invoices = new Map<string, SaasBillingInvoice>();
  const events = new Map<string, SaasBillingProviderEventReadRow>();
  const refunds = new Map<string, SaasBillingRefund>();
  const billingEmails = new Map<string, string>();
  const tariffs = new Map((input.tariffs ?? []).map((tariff) => [tariff.id, tariff]));

  /** К4 round 2 — same shared point as `insertSaasBillingInvoiceIdempotent` in the pg repository:
   *  a second call under the same `(providerId, providerIdempotencyKey)` returns the invoice
   *  already inserted instead of a duplicate row. */
  function insertInvoiceIdempotent(row: SaasBillingInvoice): {
    invoice: SaasBillingInvoice;
    created: boolean;
  } {
    const existing = [...invoices.values()].find(
      (candidate) =>
        candidate.providerId === row.providerId &&
        candidate.providerIdempotencyKey === row.providerIdempotencyKey,
    );
    if (existing) return { invoice: existing, created: false };
    invoices.set(row.id, row);
    return { invoice: row, created: true };
  }

  /** Двойник не ПОВТОРЯЕТ правило боевого репозитория, а зовёт то же самое: копия правила о деньгах
   *  расходится молча, и именно так снятое из боевого WHERE условие `asOf` осталось незамеченным. */
  function readSeatDebtForPeriod(input: {
    organizationId: string;
    saasBillingSubscriptionId: string;
    periodStartsAt: string;
    asOf: string;
    periodCurrency: string;
  }): { debts: SaasBillingInvoice[]; totalMinor: number } {
    const debts = [...invoices.values()].filter((row) =>
      isSaasBillingSeatDebtForPeriod(row, {
        organizationId: input.organizationId,
        saasBillingSubscriptionId: input.saasBillingSubscriptionId,
        periodStartsAt: input.periodStartsAt,
        asOf: input.asOf,
      }),
    );
    return {
      debts,
      totalMinor: carriedSeatDebtMinor({ periodCurrency: input.periodCurrency, debts }),
    };
  }

  /**
   *  Снять с счёта-преемника долг, который пришедшая оплата закрыла на самом деле, — тот же расчёт,
   *  что делает шов `app.release_carried_seat_debt` в боевой базе, и с тем же ответом «да/нет».
   *
   *  Цепочка преемников проходится до первого не погашенного счёта: долг мог переезжать не один
   *  раз. Снимать его можно только с ещё не оплаченного счёта и только пока он в нём стоит;
   *  «преемник уже оплачен» — это не арифметика, а лишние деньги и работа оператора.
   */
  function releaseCarriedSeatDebt(superseded: SaasBillingInvoice): boolean {
    let successor = superseded.supersededByInvoiceId
      ? invoices.get(superseded.supersededByInvoiceId)
      : undefined;
    for (let hop = 0; successor && successor.status === 'void' && hop < 16; hop += 1) {
      successor = successor.supersededByInvoiceId
        ? invoices.get(successor.supersededByInvoiceId)
        : undefined;
    }
    if (!successor || successor.currency !== superseded.currency) return false;
    if (successor.status !== 'draft' && successor.status !== 'pending') return false;
    if (successor.carriedDebtMinor < superseded.amountMinor) return false;
    invoices.set(successor.id, {
      ...successor,
      amountMinor: successor.amountMinor - superseded.amountMinor,
      carriedDebtMinor: successor.carriedDebtMinor - superseded.amountMinor,
    });
    return true;
  }

  /** Гашение долга ПОСЛЕ появления преемника — место при этом не отбирается: счётчик
   *  `paidAdditionalSeats` здесь не трогается ни на единицу. */
  function carrySeatDebtInto(debts: SaasBillingInvoice[], successorInvoiceId: string): void {
    for (const debt of debts) {
      invoices.set(debt.id, {
        ...debt,
        status: 'void',
        supersededByInvoiceId: successorInvoiceId,
      });
    }
  }

  return {
    async listBillingPeriods() {
      return DEFAULT_BILLING_PERIODS;
    },
    async getSaasBillingAccountBillingEmail(organizationId) {
      return billingEmails.get(organizationId) ?? null;
    },
    async updateSaasBillingAccountBillingEmail({ organizationId, billingEmail }) {
      const normalizedEmail = billingEmail.trim().toLowerCase();
      billingEmails.set(organizationId, normalizedEmail);
      return normalizedEmail;
    },
    async getOrganizationBillingOverview(organizationId) {
      const now = new Date().toISOString();
      return {
        organizationId,
        billingEmail: billingEmails.get(organizationId) ?? null,
        subscriptions: [...rows.values()]
          .filter((row) => row.organizationId === organizationId)
          .map((row) => ({
            ...row,
            cancelledAt: row.status === 'cancelled' ? now : null,
            createdAt: now,
            updatedAt: now,
          })),
        invoices: [...invoices.values()]
          .filter((row) => row.organizationId === organizationId)
          .map((row) => ({
            ...row,
            paidAt: row.status === 'paid' ? now : null,
            createdAt: now,
            updatedAt: now,
          })),
        providerEvents: [...events.values()].filter((row) => row.organizationId === organizationId),
      };
    },

    async getOrganizationAssignedTariffId(organizationId) {
      return organizationTariffs.get(organizationId) ?? null;
    },

    async chooseOrganizationFirstTariff({ organizationId, tariffId, actorId }) {
      if (organizationTariffs.get(organizationId)) {
        throw new Error('organization_tariff_already_assigned');
      }
      if (!tariffs.has(tariffId)) throw new Error('tariff_not_found');
      const key = subscriptionKey(organizationId, 'paid_subscription');
      rows.set(key, {
        id: crypto.randomUUID(),
        organizationId,
        saasBillingAccountId: crypto.randomUUID(),
        tariffId,
        pendingTariffId: null,
        source: 'paid_subscription',
        status: 'pending_payment',
        lifecycleState: 'active',
        providerId: null,
        savedPaymentMethodId: null,
        autopayConsentedAt: null,
        autopayConsentText: null,
        autopayRevokedAt: null,
        currentPeriodStartsAt: null,
        currentPeriodEndsAt: null,
        graceEndsAt: null,
        readOnlyEndsAt: null,
        tariffSnapshot: null,
        paidAdditionalSeats: 0,
      });
      void actorId;
      // Зеркало миграции 0024 (владелец 18.08, L-11): выбор записан строкой подписки
      // `pending_payment`, но действующим тарифом организации (`organizationTariffs`, он же
      // `be_organizations.tariff_id`) выбранный НЕ становится. Доступ без оплаты даёт только
      // реально начавшийся пробный период; в платном случае тариф вступит в силу единственным
      // путём — когда счёт будет оплачен (`captureSaasBillingPayment` ниже).
      if (organizationTrials.has(organizationId) || !trialPolicy) {
        return { outcome: 'payment_required' };
      }
      const startedAt = new Date();
      const endsAt = new Date(
        startedAt.getTime() + trialPolicy.durationDays * 86_400_000,
      ).toISOString();
      organizationTrials.set(organizationId, {
        id: crypto.randomUUID(),
        tariffId,
        status: 'active',
        endsAt,
      });
      organizationTariffs.set(organizationId, tariffId);
      return { outcome: 'trial_started', endsAt };
    },

    async listActiveTariffChoices() {
      return [
        ...new Set([
          ...tariffs.keys(),
          ...[...organizationTariffs.values()].filter((id): id is string => id !== null),
        ]),
      ]
        .sort()
        .map((id) => ({
          id,
          name: tariffs.get(id)?.name ?? 'In-memory tariff',
          priceMinor: tariffs.get(id)?.priceMinor ?? null,
        }));
    },

    async listPlatformInvoices(filter) {
      const now = new Date().toISOString();
      const paidAtOf = (row: { status: string }) => (row.status === 'paid' ? now : null);
      return [...invoices.values()]
        .filter((row) => !filter.status || row.status === filter.status)
        .filter((row) => !filter.periodFrom || now >= filter.periodFrom)
        .filter((row) => !filter.periodTo || now <= filter.periodTo)
        .filter((row) => {
          const paidAt = paidAtOf(row);
          if (filter.paidFrom && (paidAt === null || paidAt < filter.paidFrom)) return false;
          if (filter.paidTo && (paidAt === null || paidAt > filter.paidTo)) return false;
          return true;
        })
        .filter(
          (row) =>
            !filter.providerInvoiceRefs ||
            (row.providerInvoiceRef !== null &&
              filter.providerInvoiceRefs.includes(row.providerInvoiceRef)),
        )
        .map((row) => ({
          ...row,
          paidAt: paidAtOf(row),
          createdAt: now,
          updatedAt: now,
          organizationId: row.organizationId,
          // No organization title source in this fake — the platform payments screen reads the
          // real (pg) repository; only the type shape needs satisfying here.
          organizationTitle: row.organizationId,
          refundedMinor: [...refunds.values()]
            .filter((r) => r.saasBillingInvoiceId === row.id && r.status === 'succeeded')
            .reduce((sum, r) => sum + r.amountMinor, 0),
          pendingRefundMinor: [...refunds.values()]
            .filter((r) => r.saasBillingInvoiceId === row.id && r.status === 'pending')
            .reduce((sum, r) => sum + r.amountMinor, 0),
        }));
    },

    async getPlatformPaymentsSummary(filter) {
      const zeroBucket = () => ({ count: 0, amountMinor: 0 });
      const byCurrency = new Map<string, SaasBillingPlatformCurrencySummary>();
      const inPeriod = (createdAt: string) =>
        (!filter.periodFrom || createdAt >= filter.periodFrom) &&
        (!filter.periodTo || createdAt <= filter.periodTo);
      for (const row of invoices.values()) {
        const now = new Date().toISOString();
        if (!inPeriod(now)) continue;
        const entry: SaasBillingPlatformCurrencySummary = byCurrency.get(row.currency) ?? {
          currency: row.currency,
          received: zeroBucket(),
          refunded: zeroBucket(),
          inProcess: zeroBucket(),
          unpaid: zeroBucket(),
        };
        if (row.status === 'paid') {
          entry.received.count += 1;
          entry.received.amountMinor += row.amountMinor;
        } else if (row.status === 'draft' || row.status === 'pending') {
          entry.inProcess.count += 1;
          entry.inProcess.amountMinor += row.amountMinor;
        } else {
          entry.unpaid.count += 1;
          entry.unpaid.amountMinor += row.amountMinor;
        }
        byCurrency.set(row.currency, entry);
      }
      for (const refund of refunds.values()) {
        if (refund.status !== 'succeeded') continue;
        const invoice = invoices.get(refund.saasBillingInvoiceId);
        if (!invoice) continue;
        const entry = byCurrency.get(invoice.currency);
        if (!entry) continue;
        entry.refunded.count += 1;
        entry.refunded.amountMinor += refund.amountMinor;
      }
      return { byCurrency: [...byCurrency.values()] };
    },

    async getPlatformPaymentsBreakdown(filter) {
      const inPeriod = (createdAt: string) =>
        (!filter.periodFrom || createdAt >= filter.periodFrom) &&
        (!filter.periodTo || createdAt <= filter.periodTo);
      const groups = new Map<
        string,
        {
          invoiceKind: SaasBillingInvoice['invoiceKind'];
          tariffId: string;
          tariffName: string;
          tariffBillingPeriod: TariffBillingPeriodCode;
          currency: string;
          count: number;
          amountMinor: number;
        }
      >();
      for (const row of invoices.values()) {
        const now = new Date().toISOString();
        if (row.status !== 'paid' || !inPeriod(now)) continue;
        const key = `${row.invoiceKind}::${row.tariffId}::${row.tariffBillingPeriod}::${row.currency}`;
        const entry = groups.get(key) ?? {
          invoiceKind: row.invoiceKind,
          tariffId: row.tariffId,
          tariffName: row.tariffName,
          tariffBillingPeriod: row.tariffBillingPeriod,
          currency: row.currency,
          count: 0,
          amountMinor: 0,
        };
        entry.count += 1;
        entry.amountMinor += row.amountMinor;
        groups.set(key, entry);
      }
      return [...groups.values()];
    },

    async runManualAssignmentTransaction(work) {
      return work({
        async loadManualAssignmentState(organizationId) {
          const manual =
            rows.get(subscriptionKey(organizationId, 'paid_subscription')) ??
            rows.get(subscriptionKey(organizationId, 'manual')) ??
            null;
          const activeTrial = organizationTrials.get(organizationId) ?? null;
          return {
            organization: {
              tariffId: organizationTariffs.get(organizationId) ?? null,
            },
            organizationTrialConsumed: organizationTrials.has(organizationId),
            activeTrial:
              activeTrial?.status === 'active'
                ? {
                    id: activeTrial.id,
                    organizationId,
                    status: activeTrial.status,
                  }
                : null,
            manualSaasBillingSubscription: manual
              ? {
                  id: manual.id,
                  tariffId: manual.tariffId,
                  status: manual.status,
                  currentPeriodStartsAt: manual.currentPeriodStartsAt,
                  currentPeriodEndsAt: manual.currentPeriodEndsAt,
                  pendingTariffId: manual.pendingTariffId,
                }
              : null,
          };
        },
        async getActiveTrialPolicy() {
          return trialPolicy;
        },
        async startOrganizationTrial({ organizationId, tariffId, policy, audit }) {
          const existing = organizationTrials.get(organizationId);
          if (existing) return { created: false, endsAt: existing.endsAt };
          const startedAt = new Date();
          const endsAt = new Date(startedAt.getTime() + policy.durationDays * 86_400_000).toISOString();
          const id = crypto.randomUUID();
          organizationTrials.set(organizationId, {
            id,
            tariffId,
            status: 'active',
            endsAt,
          });
          void audit;
          return { created: true, endsAt };
        },
        async requireActiveTariff() {
          return { billingPeriod: 'month' as const };
        },
        async setManualSaasBillingSubscription({
          organizationId,
          tariffId,
          period,
          pendingTariffId = null,
        }) {
          const source = rows.has(subscriptionKey(organizationId, 'paid_subscription'))
            ? 'paid_subscription'
            : 'manual';
          const key = subscriptionKey(organizationId, source);
          if (tariffId === null) {
            const current = rows.get(key);
            if (current) {
              rows.set(key, {
                ...current,
                status: 'cancelled',
                currentPeriodStartsAt: null,
                currentPeriodEndsAt: null,
              });
            }
            return;
          }
          const current = rows.get(key);
          const tariff = tariffs.get(tariffId);
          rows.set(key, {
            id: current?.id ?? crypto.randomUUID(),
            organizationId,
            saasBillingAccountId: current?.saasBillingAccountId ?? crypto.randomUUID(),
            tariffId,
            pendingTariffId,
            source,
            status: 'active',
            lifecycleState: 'active',
            providerId: null,
            savedPaymentMethodId: null,
            autopayConsentedAt: null,
            autopayConsentText: null,
            autopayRevokedAt: null,
            currentPeriodStartsAt: period?.startsAt ?? null,
            currentPeriodEndsAt: period?.endsAt ?? null,
            graceEndsAt: null,
            readOnlyEndsAt: null,
            tariffSnapshot: period && tariff
              ? {
                  id: tariff.id,
                  price_minor: tariff.priceMinor,
                  currency: tariff.currency,
                  billing_period: tariff.billingPeriod,
                }
              : null,
            paidAdditionalSeats: 0,
          });
        },
        async updateOrganizationTariffAssignment({ organizationId, tariffId }) {
          organizationTariffs.set(organizationId, tariffId);
          return { tariffId };
        },
        async endActiveTrial(trialId) {
          for (const [organizationId, trial] of organizationTrials) {
            if (trial.id !== trialId) continue;
            organizationTrials.set(organizationId, { ...trial, status: 'ended' });
            return trial;
          }
          throw new Error('trial_conversion_conflict');
        },
        async appendManualAssignmentAudit() {},
      });
    },

    async createSaasBillingInvoice(input) {
      // #1057 — old K0 keys were clock-bucketed. A retry after that bucket changed must still use
      // the empty renewal invoice for this exact subscription period. Manual invoices have a
      // description and seat overage has a different kind, so neither can alias this path. The
      // expiry is not a discriminator: every invoice now carries one from the настройка.
      const existingRenewal = [...invoices.values()].find(
        (row) =>
          row.saasBillingSubscriptionId === input.saasBillingSubscriptionId &&
          row.servicePeriodStartsAt === input.servicePeriodStartsAt &&
          row.servicePeriodEndsAt === input.servicePeriodEndsAt &&
          row.invoiceKind === 'tariff_period' &&
          row.description === null,
      );
      const authority = [...rows.values()].find(
        (row) =>
          row.id === input.saasBillingSubscriptionId && row.organizationId === input.organizationId,
      );
      if (!authority) throw new Error('saas_billing_subscription_not_found');
      const tariff = tariffs.get(purchasedTariffId(authority));
      if (existingRenewal) {
        // Same refresh rule as the pg repository: an unclaimed draft for this period that names a
        // tariff the clinic is no longer buying is rewritten, never handed back as is.
        if (existingRenewal.tariffId === purchasedTariffId(authority)) {
          return { invoice: existingRenewal, created: false };
        }
        if (existingRenewal.status !== 'draft' || existingRenewal.providerInvoiceRef !== null) {
          return { invoice: existingRenewal, created: false };
        }
        const refreshed: SaasBillingInvoice = {
          ...existingRenewal,
          tariffId: purchasedTariffId(authority),
          tariffName: tariff?.name ?? 'In-memory tariff',
          amountMinor: tariff?.priceMinor ?? 0,
          carriedDebtMinor: 0,
          supersededByInvoiceId: null,
          currency: tariff?.currency ?? 'RUB',
          tariffBillingPeriod: tariff?.billingPeriod ?? 'month',
          additionalSeatQuantity: authority.paidAdditionalSeats,
          tariffSnapshot: tariff
            ? {
                id: tariff.id,
                price_minor: tariff.priceMinor,
                currency: tariff.currency,
                billing_period: tariff.billingPeriod,
              }
            : null,
        };
        invoices.set(refreshed.id, refreshed);
        return { invoice: refreshed, created: false };
      }
      // Долг за место с прошлого периода едет строкой сюда — та же дверь и тот же порядок, что в
      // pg-репозитории: преемник появляется первым, долг гасится только им.
      const seatDebt = readSeatDebtForPeriod({
        organizationId: authority.organizationId,
        saasBillingSubscriptionId: authority.id,
        periodStartsAt: input.servicePeriodStartsAt,
        asOf: input.asOf,
        periodCurrency: tariff?.currency ?? 'RUB',
      });
      const row: SaasBillingInvoice = {
        id: crypto.randomUUID(),
        organizationId: authority.organizationId,
        saasBillingAccountId: authority.saasBillingAccountId,
        saasBillingSubscriptionId: authority.id,
        tariffId: purchasedTariffId(authority),
        tariffName: tariff?.name ?? 'In-memory tariff',
        invoiceKind: 'tariff_period',
        additionalSeatQuantity: authority.paidAdditionalSeats,
        description: null,
        amountMinor: (tariff?.priceMinor ?? 0) + seatDebt.totalMinor,
        carriedDebtMinor: seatDebt.totalMinor,
        supersededByInvoiceId: null,
        currency: tariff?.currency ?? 'RUB',
        tariffBillingPeriod: tariff?.billingPeriod ?? 'month',
        tariffSnapshot: tariff
          ? {
              id: tariff.id,
              price_minor: tariff.priceMinor,
              currency: tariff.currency,
              billing_period: tariff.billingPeriod,
            }
          : null,
        servicePeriodStartsAt: input.servicePeriodStartsAt,
        servicePeriodEndsAt: input.servicePeriodEndsAt,
        expiresAt: input.expiresAt,
        status: 'draft',
        providerId: input.providerId,
        providerInvoiceRef: null,
        providerCheckoutUrl: null,
        providerIdempotencyKey: input.providerIdempotencyKey,
      };
      const { successor } = await reissueWithSuccessor({
        issueSuccessor: async () => insertInvoiceIdempotent(row),
        retireSuperseded: async ({ invoice, created }) => {
          if (created) carrySeatDebtInto(seatDebt.debts, invoice.id);
        },
      });
      return successor;
    },

    async createProratedTariffUpgradeInvoice(input) {
      const entry = [...rows.entries()].find(
        ([, row]) => row.id === input.saasBillingSubscriptionId && row.organizationId === input.organizationId,
      );
      if (!entry) throw new Error('saas_billing_subscription_not_found');
      const [key, subscription] = entry;
      if (!subscription.currentPeriodStartsAt || !subscription.currentPeriodEndsAt) {
        throw new Error('saas_billing_no_active_paid_subscription');
      }
      const openInvoice = [...invoices.values()].find(
        (invoice) =>
          invoice.saasBillingSubscriptionId === subscription.id &&
          invoice.tariffId === input.targetTariffId &&
          invoice.description === SAAS_BILLING_TARIFF_UPGRADE_DESCRIPTION &&
          (invoice.status === 'draft' || invoice.status === 'pending'),
      );
      if (openInvoice) return { outcome: 'checkout' as const, invoice: openInvoice, created: false };
      const currentTariff = paidPeriodSnapshotPrice(subscription.tariffSnapshot);
      const targetTariff = tariffs.get(input.targetTariffId);
      if (!targetTariff) throw new Error('saas_billing_tariff_not_billable');
      if (
        currentTariff.currency !== targetTariff.currency ||
        currentTariff.billingPeriod !== targetTariff.billingPeriod
      ) {
        throw new Error('saas_billing_tariff_upgrade_proration_unavailable');
      }
      if (targetTariff.priceMinor <= currentTariff.priceMinor) return { outcome: 'scheduled' };
      const currentPeriodAdjustmentMinor = proratedRemainingPeriodAmountMinor({
        currentPriceMinor: currentTariff.priceMinor,
        targetPriceMinor: targetTariff.priceMinor,
        periodStartsAt: subscription.currentPeriodStartsAt,
        periodEndsAt: subscription.currentPeriodEndsAt,
        asOf: input.asOf,
      });
      if (currentPeriodAdjustmentMinor === 0) {
        throw new Error('saas_billing_upgrade_no_remaining_period');
      }
      const paidFuturePeriod = [...invoices.values()].find(
        (invoice) =>
          invoice.saasBillingSubscriptionId === subscription.id &&
          invoice.invoiceKind === 'tariff_period' &&
          invoice.description === null &&
          invoice.status === 'paid' &&
          invoice.servicePeriodStartsAt === subscription.currentPeriodEndsAt,
      );
      const targetAdditionalSeatPriceMinor = targetTariff.additionalSeatPriceMinor ?? null;
      if (subscription.paidAdditionalSeats > 0 && targetAdditionalSeatPriceMinor === null) {
        throw new Error('saas_billing_additional_seat_price_missing');
      }
      const targetFuturePeriodAmountMinor =
        targetTariff.priceMinor +
        subscription.paidAdditionalSeats * (targetAdditionalSeatPriceMinor ?? 0);
      if (
        paidFuturePeriod &&
        (paidFuturePeriod.currency !== targetTariff.currency ||
          paidFuturePeriod.tariffBillingPeriod !== targetTariff.billingPeriod ||
          paidFuturePeriod.amountMinor > targetFuturePeriodAmountMinor)
      ) {
        throw new Error('saas_billing_tariff_upgrade_proration_unavailable');
      }
      const futurePeriodAdjustmentMinor = paidFuturePeriod
        ? targetFuturePeriodAmountMinor - paidFuturePeriod.amountMinor
        : 0;
      const amountMinor = currentPeriodAdjustmentMinor + futurePeriodAdjustmentMinor;
      const invoice: SaasBillingInvoice = {
        id: crypto.randomUUID(),
        organizationId: subscription.organizationId,
        saasBillingAccountId: subscription.saasBillingAccountId,
        saasBillingSubscriptionId: subscription.id,
        tariffId: targetTariff.id,
        tariffName: targetTariff.name,
        invoiceKind: 'tariff_period',
        additionalSeatQuantity: 0,
        description: SAAS_BILLING_TARIFF_UPGRADE_DESCRIPTION,
        amountMinor,
        carriedDebtMinor: 0,
        supersededByInvoiceId: null,
        currency: targetTariff.currency,
        tariffBillingPeriod: targetTariff.billingPeriod,
        tariffSnapshot: {
          id: targetTariff.id,
          price_minor: targetTariff.priceMinor,
          currency: targetTariff.currency,
          billing_period: targetTariff.billingPeriod,
          additional_seat_price_minor: targetAdditionalSeatPriceMinor,
          upgrade_future_period_adjustment_minor: futurePeriodAdjustmentMinor,
        },
        servicePeriodStartsAt: input.asOf,
        servicePeriodEndsAt: subscription.currentPeriodEndsAt,
        expiresAt: input.expiresAt,
        status: 'draft',
        providerId: input.providerId,
        providerInvoiceRef: null,
        providerCheckoutUrl: null,
        providerIdempotencyKey: input.providerIdempotencyKey,
      };
      rows.set(key, subscription);
      return { outcome: 'checkout' as const, ...insertInvoiceIdempotent(invoice) };
    },

    async attachSaasBillingInvoiceReceiptSnapshot({ saasBillingInvoiceId, receipt }) {
      const current = invoices.get(saasBillingInvoiceId);
      if (!current) throw new Error('saas_billing_invoice_not_found');
      const invoice = {
        ...current,
        tariffSnapshot: withReceiptSnapshot(current.tariffSnapshot, receipt),
      };
      invoices.set(invoice.id, invoice);
      return invoice;
    },

    async attachSaasBillingInvoiceProviderIntent(input) {
      const current = invoices.get(input.saasBillingInvoiceId);
      if (!current) throw new Error('saas_billing_invoice_not_found');
      const row: SaasBillingInvoice = {
        ...current,
        providerInvoiceRef: input.providerInvoiceRef,
        providerCheckoutUrl: input.providerCheckoutUrl,
        status: 'pending',
      };
      invoices.set(row.id, row);
      return row;
    },

    async claimSaasBillingInvoiceProviderIntent(saasBillingInvoiceId) {
      const current = invoices.get(saasBillingInvoiceId);
      if (!current || current.status !== 'draft' || current.providerInvoiceRef !== null) return false;
      invoices.set(current.id, { ...current, status: 'pending' });
      return true;
    },

    async releaseSaasBillingInvoiceProviderIntent(input) {
      const current = invoices.get(input.saasBillingInvoiceId);
      if (current?.status === 'pending' && current.providerInvoiceRef === null) {
        invoices.set(current.id, {
          ...current,
          status: 'draft',
          ...(input.rotateProviderIdempotencyKeyTo
            ? { providerIdempotencyKey: input.rotateProviderIdempotencyKeyTo }
            : {}),
        });
      }
    },

    async recordSaasBillingProviderEvent(input) {
      const key = `${input.event.providerId}:${input.event.providerEventId}`;
      if (events.has(key)) return { created: false };
      events.set(key, {
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        saasBillingInvoiceId: input.saasBillingInvoiceId,
        providerId: input.event.providerId,
        providerEventId: input.event.providerEventId,
        eventType: input.event.type,
        processedAt: null,
        createdAt: new Date().toISOString(),
      });
      return { created: true };
    },

    async captureSaasBillingPaymentSucceeded(input) {
      const key = `${input.event.providerId}:${input.event.providerEventId}`;
      const existingEvent = events.get(key);
      const current = invoices.get(input.saasBillingInvoiceId);
      if (!current || current.organizationId !== input.organizationId) {
        return { captured: false, duplicate: Boolean(existingEvent) };
      }
      const invoice = current;
      return captureSaasBillingPaidInvoice(invoice, {
        // Тот же порядок, что в боевом репозитории: снять долг со счёта-преемника и только после
        // этого гасить сам счёт.
        settleSuperseded: async () => (releaseCarriedSeatDebt(invoice) ? 'released' : 'blocked'),
        // Не сняли — деньги лишние, счёт остаётся погашенным преемником, а оплата не выбрасывается
        // молча (в PG на этом месте пишется запись аудита оператору).
        refuse: async (reason) => ({
          captured: false,
          duplicate: reason === 'closed' ? Boolean(existingEvent) : false,
        }),
        markPaid: async (cameFromSupersededPath) => {
          const paidInvoice = cameFromSupersededPath
            ? { ...invoice, supersededByInvoiceId: null }
            : invoice;
          if (cameFromSupersededPath) invoices.set(paidInvoice.id, paidInvoice);
          if (!existingEvent) {
            events.set(key, {
              id: crypto.randomUUID(),
              organizationId: input.organizationId,
              saasBillingInvoiceId: paidInvoice.id,
              providerId: input.event.providerId,
              providerEventId: input.event.providerEventId,
              eventType: input.event.type,
              processedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            });
          }
          if (paidInvoice.status !== 'paid') invoices.set(paidInvoice.id, { ...paidInvoice, status: 'paid' });
          const entry = [...rows.entries()].find(
            ([, subscriptionRow]) => subscriptionRow.id === paidInvoice.saasBillingSubscriptionId,
          );
          if (!entry) throw new Error('saas_billing_subscription_not_found');
          const [subscriptionKeyValue, subscription] = entry;
          if (input.savedPaymentMethodId && paidInvoice.invoiceKind === 'tariff_period') {
            rows.set(subscriptionKeyValue, {
              ...subscription,
              savedPaymentMethodId: input.savedPaymentMethodId,
            });
          }
          // Место уже открыто в момент выставления этого счёта (Р-15, действующая редакция: см.
          // `createSeatOverageInvoiceIfNeeded` ниже), и здесь оно НЕ открывается второй раз: приём
          // денег только закрывает счёт (как в pg-репозитории, `pgSaasBilling.ts`).
          if (
            paidInvoice.description === SAAS_BILLING_TARIFF_UPGRADE_DESCRIPTION &&
            paidInvoice.status !== 'paid' &&
            paidInvoice.servicePeriodEndsAt === subscription.currentPeriodEndsAt
          ) {
            const targetTariff = paidPeriodSnapshotPrice(paidInvoice.tariffSnapshot);
            const additionalSeatPriceMinor = paidPeriodSnapshotAdditionalSeatPrice(paidInvoice.tariffSnapshot);
            if (subscription.paidAdditionalSeats > 0 && additionalSeatPriceMinor === null) {
              throw new Error('saas_billing_additional_seat_price_missing');
            }
            for (const invoice of invoices.values()) {
              if (
                invoice.saasBillingSubscriptionId === subscription.id &&
                invoice.invoiceKind === 'tariff_period' &&
                invoice.description === null &&
                invoice.status === 'paid' &&
                invoice.servicePeriodStartsAt === subscription.currentPeriodEndsAt
              ) {
                invoices.set(invoice.id, {
                  ...invoice,
                  tariffId: paidInvoice.tariffId,
                  tariffName: paidInvoice.tariffName,
                  currency: targetTariff.currency,
                  tariffBillingPeriod: targetTariff.billingPeriod,
                  tariffSnapshot: paidInvoice.tariffSnapshot,
                });
              }
            }
            rows.set(subscriptionKeyValue, {
              ...subscription,
              tariffId: paidInvoice.tariffId,
              pendingTariffId: null,
              tariffSnapshot: paidInvoice.tariffSnapshot,
              status: 'active',
              lifecycleState: 'active',
            });
            organizationTariffs.set(input.organizationId, paidInvoice.tariffId);
          }
          const due =
            paidInvoice.invoiceKind === 'tariff_period' &&
            paidInvoice.servicePeriodStartsAt <= input.paidAt &&
            (subscription.currentPeriodEndsAt === paidInvoice.servicePeriodStartsAt ||
              (subscription.currentPeriodEndsAt === null &&
                paidInvoice.tariffId === (subscription.pendingTariffId ?? subscription.tariffId)));
          if (due) {
            const latest = rows.get(subscriptionKeyValue) as SaasBillingSubscription;
            rows.set(subscriptionKeyValue, {
              ...latest,
              tariffId: paidInvoice.tariffId,
              pendingTariffId: null,
              status: 'active',
              lifecycleState: 'active',
              currentPeriodStartsAt: paidInvoice.servicePeriodStartsAt,
              currentPeriodEndsAt: paidInvoice.servicePeriodEndsAt,
              tariffSnapshot: paidInvoice.tariffSnapshot,
            });
            organizationTariffs.set(input.organizationId, paidInvoice.tariffId);
          }
          return { captured: paidInvoice.status !== 'paid', duplicate: Boolean(existingEvent) };
        },
      });
    },

    async findSaasBillingInvoiceByProviderRef({ providerId, providerInvoiceRef }) {
      const found = [...invoices.values()].find(
        (row) => row.providerId === providerId && row.providerInvoiceRef === providerInvoiceRef,
      );
      return found ?? null;
    },

    async createManualSaasBillingInvoice(input) {
      const authority = [...rows.values()].find(
        (row) =>
          row.id === input.saasBillingSubscriptionId && row.organizationId === input.organizationId,
      );
      if (!authority) throw new Error('saas_billing_subscription_not_found');
      // An admin-issued invoice is not a tariff purchase: its amount, description and expiry are
      // typed by the admin and it names the CURRENT tariff, exactly as the pg repository does.
      const tariff = tariffs.get(authority.tariffId);
      const row: SaasBillingInvoice = {
        id: crypto.randomUUID(),
        organizationId: authority.organizationId,
        saasBillingAccountId: authority.saasBillingAccountId,
        saasBillingSubscriptionId: authority.id,
        tariffId: authority.tariffId,
        tariffName: tariff?.name ?? 'In-memory tariff',
        invoiceKind: input.invoiceKind,
        additionalSeatQuantity: input.additionalSeatQuantity,
        description: input.description,
        amountMinor: input.amountMinor,
        carriedDebtMinor: 0,
        supersededByInvoiceId: null,
        currency: input.currency,
        tariffBillingPeriod: 'month',
        tariffSnapshot: null,
        servicePeriodStartsAt: input.servicePeriodStartsAt,
        servicePeriodEndsAt: input.servicePeriodEndsAt,
        expiresAt: input.expiresAt,
        status: 'draft',
        providerId: input.providerId,
        providerInvoiceRef: null,
        providerCheckoutUrl: null,
        providerIdempotencyKey: input.providerIdempotencyKey,
      };
      return insertInvoiceIdempotent(row);
    },

    async createSeatOverageInvoiceIfNeeded(input) {
      const existing = [...invoices.values()].find(
        (row) =>
          row.providerId === input.providerId &&
          row.providerIdempotencyKey === input.providerIdempotencyKey,
      );
      if (existing) return { outcome: 'invoice' as const, invoice: existing, created: false };
      const authorityEntry = [...rows.entries()].find(
        ([, row]) =>
          row.id === input.saasBillingSubscriptionId && row.organizationId === input.organizationId,
      );
      if (!authorityEntry) throw new Error('saas_billing_subscription_not_found');
      const [authorityKey, authority] = authorityEntry;
      // Как в pg-репозитории: решение принимает ЕДИНСТВЕННАЯ дверь `decideSeatOverage`, а цена из
      // котировки только СВЕРЯЕТСЯ. Двойник со своим расчётом описывал бы контракт, которого нет.
      // Мест у двойника нет вовсе, поэтому он всегда стоит ровно на пределе: `used` = предел.
      const seatTariff = tariffs.get(purchasedTariffId(authority));
      const offer = decideSeatOverage({
        includedSeats: 0,
        paidAdditionalSeats: authority.paidAdditionalSeats,
        used: authority.paidAdditionalSeats,
        additionalSeatPriceMinor: seatTariff?.additionalSeatPriceMinor ?? null,
        currency: seatTariff?.currency ?? null,
        currentPeriodStartsAt: authority.currentPeriodStartsAt,
        currentPeriodEndsAt: authority.currentPeriodEndsAt,
        asOf: now().toISOString(),
      });
      if (offer.outcome === 'seat_available') return { outcome: 'seat_available' as const };
      if (offer.outcome === 'seat_not_sold') {
        return { outcome: 'seat_overage_unavailable' as const };
      }
      if (offer.outcome === 'paid_period_over') {
        return { outcome: 'paid_period_over' as const };
      }
      if (input.quotePriceMinor !== offer.priceMinor || input.quoteCurrency !== offer.currency) {
        return {
          outcome: 'price_changed' as const,
          priceMinor: offer.priceMinor,
          currency: offer.currency,
          priceStableUntil: offer.priceStableUntil,
        };
      }
      const row: SaasBillingInvoice = {
        id: crypto.randomUUID(),
        organizationId: authority.organizationId,
        saasBillingAccountId: authority.saasBillingAccountId,
        saasBillingSubscriptionId: authority.id,
        tariffId: authority.tariffId,
        tariffName: 'In-memory tariff',
        invoiceKind: 'seat_overage',
        additionalSeatQuantity: 1,
        description: 'Дополнительное место специалиста сверх тарифа',
        amountMinor: offer.priceMinor,
        currency: offer.currency,
        carriedDebtMinor: 0,
        supersededByInvoiceId: null,
        tariffBillingPeriod: 'month',
        tariffSnapshot: null,
        servicePeriodStartsAt: offer.servicePeriodStartsAt,
        servicePeriodEndsAt: offer.servicePeriodEndsAt,
        // Р-19: срок у счёта за место один — конец периода той же услуги, что он продаёт.
        expiresAt: offer.servicePeriodEndsAt,
        status: 'draft',
        providerId: input.providerId,
        providerInvoiceRef: null,
        providerCheckoutUrl: null,
        providerIdempotencyKey: input.providerIdempotencyKey,
      };
      invoices.set(row.id, row);
      // Место открывается СРАЗУ вместе с выставлением счёта (Р-15) — как в pg-репозитории, где это
      // одна транзакция под замком организации. Приём платежа счётчика больше не трогает.
      rows.set(authorityKey, {
        ...authority,
        paidAdditionalSeats: authority.paidAdditionalSeats + 1,
      });
      return { outcome: 'invoice' as const, invoice: row, created: true };
    },

    async cancelSaasBillingInvoice({ saasBillingInvoiceId }) {
      const current = invoices.get(saasBillingInvoiceId);
      if (!current) return { outcome: 'invoice_not_found' as const };
      // Тот же вердикт, что у pg-репозитория, экрана и маршрута: счёт за место сюда доходит с
      // `seat_invoice_not_cancellable` (Р-17) и место поэтому не закрывает.
      const verdict = saasBillingInvoiceCancelVerdict(current);
      if (!verdict.allowed) {
        return verdict.refusal === 'seat_invoice_not_cancellable'
          ? { outcome: 'seat_invoice_not_cancellable' as const }
          : { outcome: 'invoice_not_cancellable' as const, status: current.status };
      }
      const row: SaasBillingInvoice = { ...current, status: 'void' };
      invoices.set(row.id, row);
      return { outcome: 'cancelled' as const, invoice: row };
    },

    async requireOwnTariffBillingSubscription(organizationId) {
      const key = subscriptionKey(organizationId, 'paid_subscription');
      const current = rows.get(key);
      // Как в pg-репозитории: действующий тариф организации, а если его ещё нет — выбранный,
      // который ждёт оплаты в собственной строке подписки (владелец 18.08, L-11).
      const tariffId = organizationTariffs.get(organizationId) ?? current?.tariffId ?? null;
      if (!tariffId) throw new Error('saas_billing_no_tariff_assigned');
      const row: SaasBillingSubscription = {
        id: current?.id ?? crypto.randomUUID(),
        organizationId,
        saasBillingAccountId: current?.saasBillingAccountId ?? crypto.randomUUID(),
        tariffId,
        pendingTariffId: current?.pendingTariffId ?? null,
        source: 'paid_subscription',
        status: current?.status ?? 'pending_payment',
        lifecycleState: current?.lifecycleState ?? 'active',
        providerId: current?.providerId ?? null,
        savedPaymentMethodId: current?.savedPaymentMethodId ?? null,
        autopayConsentedAt: current?.autopayConsentedAt ?? null,
        autopayConsentText: current?.autopayConsentText ?? null,
        autopayRevokedAt: current?.autopayRevokedAt ?? null,
        currentPeriodStartsAt: current?.currentPeriodStartsAt ?? null,
        currentPeriodEndsAt: current?.currentPeriodEndsAt ?? null,
        graceEndsAt: current?.graceEndsAt ?? null,
        readOnlyEndsAt: current?.readOnlyEndsAt ?? null,
        tariffSnapshot: current?.tariffSnapshot ?? null,
        paidAdditionalSeats: current?.paidAdditionalSeats ?? 0,
      };
      rows.set(key, row);
      // Owner ruling 18.08.2026 — price AND billing period come from the ONE tariff being
      // purchased, by the same shared rule the pg repository uses; a fake that decided this its
      // own way is exactly why a mixed invoice went unnoticed.
      const purchasedId = purchasedTariffId(row);
      const tariff = tariffs.get(purchasedId);
      return {
        saasBillingSubscriptionId: row.id,
        currentTariffId: row.tariffId,
        purchasedTariffPriceMinor: tariff?.priceMinor ?? null,
        tariffId: purchasedId,
        billingPeriod: tariff?.billingPeriod ?? 'month',
        savedPaymentMethodId: row.savedPaymentMethodId,
        additionalSeatPriceMinor: null,
        currency: tariff?.currency ?? 'RUB',
        currentPeriodStartsAt: row.currentPeriodStartsAt,
        currentPeriodEndsAt: row.currentPeriodEndsAt,
      };
    },

    async listSaasBillingSubscriptionsDueForRenewal({ asOf, limit }) {
      return [...rows.values()]
        .filter(
          (row) =>
            row.source === 'paid_subscription' &&
            row.status === 'active' &&
            row.currentPeriodEndsAt !== null &&
            row.currentPeriodEndsAt <= asOf,
        )
        .slice(0, limit)
        .map((row) => ({
          saasBillingSubscriptionId: row.id,
          organizationId: row.organizationId,
          tariffId: purchasedTariffId(row),
          pendingTariffId: row.pendingTariffId,
          billingPeriod: tariffs.get(purchasedTariffId(row))?.billingPeriod ?? 'month',
          currentPeriodEndsAt: row.currentPeriodEndsAt as string,
          savedPaymentMethodId: row.savedPaymentMethodId,
          autopayConsentedAt: row.autopayConsentedAt,
          autopayRevokedAt: row.autopayRevokedAt,
        }));
    },

    async createSaasBillingRenewalInvoiceIfAbsent(input) {
      const existing = [...invoices.values()].find(
        (row) =>
          row.saasBillingSubscriptionId === input.saasBillingSubscriptionId &&
          row.servicePeriodStartsAt === input.servicePeriodStartsAt &&
          row.servicePeriodEndsAt === input.servicePeriodEndsAt,
      );
      if (existing) return { invoice: existing, created: false };

      const authority = [...rows.values()].find(
        (row) =>
          row.id === input.saasBillingSubscriptionId && row.organizationId === input.organizationId,
      );
      if (!authority) throw new Error('saas_billing_subscription_not_found');
      const tariff = tariffs.get(purchasedTariffId(authority));
      const seatDebt = readSeatDebtForPeriod({
        organizationId: authority.organizationId,
        saasBillingSubscriptionId: authority.id,
        periodStartsAt: input.servicePeriodStartsAt,
        asOf: input.asOf,
        periodCurrency: tariff?.currency ?? 'RUB',
      });
      const row: SaasBillingInvoice = {
        id: crypto.randomUUID(),
        organizationId: authority.organizationId,
        saasBillingAccountId: authority.saasBillingAccountId,
        saasBillingSubscriptionId: authority.id,
        tariffId: purchasedTariffId(authority),
        tariffName: 'In-memory tariff',
        invoiceKind: 'tariff_period',
        additionalSeatQuantity: authority.paidAdditionalSeats,
        description: null,
        amountMinor: (tariff?.priceMinor ?? 0) + seatDebt.totalMinor,
        carriedDebtMinor: seatDebt.totalMinor,
        supersededByInvoiceId: null,
        currency: tariff?.currency ?? 'RUB',
        tariffBillingPeriod: tariff?.billingPeriod ?? 'month',
        tariffSnapshot: tariff
          ? {
              id: tariff.id,
              price_minor: tariff.priceMinor,
              currency: tariff.currency,
              billing_period: tariff.billingPeriod,
            }
          : null,
        servicePeriodStartsAt: input.servicePeriodStartsAt,
        servicePeriodEndsAt: input.servicePeriodEndsAt,
        expiresAt: input.expiresAt,
        status: 'draft',
        providerId: input.providerId,
        providerInvoiceRef: null,
        providerCheckoutUrl: null,
        providerIdempotencyKey: input.providerIdempotencyKey,
      };
      const { successor } = await reissueWithSuccessor({
        issueSuccessor: async () => {
          invoices.set(row.id, row);
          return row;
        },
        retireSuperseded: async (inserted) => carrySeatDebtInto(seatDebt.debts, inserted.id),
      });
      return { invoice: successor, created: true };
    },

    async promoteDueSaasBillingPaidInvoice({ organizationId, saasBillingSubscriptionId, asOf }) {
      const entry = [...rows.entries()].find(([, row]) => row.id === saasBillingSubscriptionId);
      if (!entry) throw new Error('saas_billing_subscription_not_found');
      const [key, subscription] = entry;
      const candidate = [...invoices.values()].find(
        (row) =>
          row.organizationId === organizationId &&
          row.saasBillingSubscriptionId === saasBillingSubscriptionId &&
          row.invoiceKind === 'tariff_period' &&
          row.status === 'paid' &&
          row.servicePeriodStartsAt === subscription.currentPeriodEndsAt &&
          row.servicePeriodStartsAt <= asOf,
      );
      if (!candidate) return false;
      rows.set(key, {
        ...subscription,
        tariffId: candidate.tariffId,
        pendingTariffId: null,
        status: 'active',
        lifecycleState: 'active',
        currentPeriodStartsAt: candidate.servicePeriodStartsAt,
        currentPeriodEndsAt: candidate.servicePeriodEndsAt,
      });
      organizationTariffs.set(organizationId, candidate.tariffId);
      return true;
    },

    async reserveSaasBillingRefund({ saasBillingInvoiceId, amountMinor, providerIdempotencyKey }) {
      const invoice = invoices.get(saasBillingInvoiceId);
      if (!invoice) return { outcome: 'invoice_not_found' as const };
      if (invoice.status !== 'paid') {
        return { outcome: 'invoice_not_refundable' as const, status: invoice.status };
      }
      if (invoice.invoiceKind === 'seat_overage' && amountMinor !== invoice.amountMinor) {
        return { outcome: 'seat_overage_partial_refund_forbidden' as const };
      }
      const refundedMinor = [...refunds.values()]
        .filter(
          (r) =>
            r.saasBillingInvoiceId === saasBillingInvoiceId &&
            OPEN_REFUND_STATUSES.includes(r.status),
        )
        .reduce((sum, r) => sum + r.amountMinor, 0);
      const remainingMinor = invoice.amountMinor - refundedMinor;
      if (amountMinor > remainingMinor) {
        return { outcome: 'amount_exceeds_remaining' as const, remainingMinor };
      }
      const existing = [...refunds.values()].find(
        (r) =>
          r.providerId === invoice.providerId &&
          r.providerIdempotencyKey === providerIdempotencyKey,
      );
      if (existing) return { outcome: 'duplicate' as const, refund: existing };

      const now = new Date().toISOString();
      const refund: SaasBillingRefund = {
        id: crypto.randomUUID(),
        organizationId: invoice.organizationId,
        saasBillingInvoiceId,
        amountMinor,
        currency: invoice.currency,
        status: 'pending',
        providerId: invoice.providerId,
        providerRefundRef: null,
        providerIdempotencyKey,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      refunds.set(refund.id, refund);
      return { outcome: 'reserved' as const, refund, invoice };
    },

    async attachSaasBillingRefundProviderRef({ saasBillingRefundId, providerRefundRef }) {
      const current = refunds.get(saasBillingRefundId);
      if (!current) throw new Error('saas_billing_refund_not_found');
      const refund: SaasBillingRefund = { ...current, providerRefundRef };
      refunds.set(refund.id, refund);
      return refund;
    },

    async markSaasBillingRefundFailed({ saasBillingRefundId }) {
      const current = refunds.get(saasBillingRefundId);
      if (!current) throw new Error('saas_billing_refund_not_found');
      const refund: SaasBillingRefund = { ...current, status: 'failed' };
      refunds.set(refund.id, refund);
      return refund;
    },

    async findSaasBillingRefundByProviderRef({ providerId, providerRefundRef }) {
      const found = [...refunds.values()].find(
        (r) => r.providerId === providerId && r.providerRefundRef === providerRefundRef,
      );
      return found ?? null;
    },

    async confirmSaasBillingRefund({ saasBillingRefundId, organizationId, status, confirmedAt }) {
      const current = refunds.get(saasBillingRefundId);
      if (!current || current.organizationId !== organizationId) {
        throw new Error('saas_billing_refund_not_found');
      }
      if (current.status !== 'pending') return current;
      const refund: SaasBillingRefund = { ...current, status, confirmedAt };
      refunds.set(refund.id, refund);
      const invoice = invoices.get(refund.saasBillingInvoiceId);
      if (status === 'succeeded' && invoice?.invoiceKind === 'seat_overage') {
        const entry = [...rows.entries()].find(
          ([, row]) => row.id === invoice.saasBillingSubscriptionId,
        );
        if (entry) {
          const [key, subscription] = entry;
          rows.set(key, {
            ...subscription,
            paidAdditionalSeats: Math.max(
              subscription.paidAdditionalSeats - invoice.additionalSeatQuantity,
              0,
            ),
          });
        }
      }
      return refund;
    },

    async grantSaasBillingAutopayConsent({ organizationId, consentText, consentedAt }) {
      const key = subscriptionKey(organizationId, 'paid_subscription');
      const current = rows.get(key);
      if (!current) return { outcome: 'no_subscription' as const };
      rows.set(key, {
        ...current,
        autopayConsentedAt: consentedAt,
        autopayConsentText: consentText,
        autopayRevokedAt: null,
      });
      return { outcome: 'granted' as const };
    },

    async revokeSaasBillingAutopayConsent({ organizationId, revokedAt }) {
      const key = subscriptionKey(organizationId, 'paid_subscription');
      const current = rows.get(key);
      if (!current) return { outcome: 'no_subscription' as const };
      rows.set(key, { ...current, autopayRevokedAt: revokedAt });
      return { outcome: 'revoked' as const };
    },

    async saveSaasBillingSubscriptionPaymentMethod({
      saasBillingSubscriptionId,
      organizationId,
      savedPaymentMethodId,
    }) {
      const entry = [...rows.entries()].find(
        ([, row]) => row.id === saasBillingSubscriptionId && row.organizationId === organizationId,
      );
      if (!entry) throw new Error('saas_billing_subscription_not_found');
      const [key, current] = entry;
      rows.set(key, { ...current, savedPaymentMethodId });
    },

    async markSaasBillingInvoiceFailed({ saasBillingInvoiceId, organizationId }) {
      const current = invoices.get(saasBillingInvoiceId);
      if (
        !current ||
        current.organizationId !== organizationId ||
        (current.status !== 'draft' && current.status !== 'pending')
      ) {
        return null;
      }
      const row: SaasBillingInvoice = { ...current, status: 'failed' };
      invoices.set(row.id, row);
      return row;
    },

    async prepareSaasBillingFailedInvoiceForManualCheckout(input) {
      const current = invoices.get(input.saasBillingInvoiceId);
      if (!current || current.organizationId !== input.organizationId) {
        throw new Error('saas_billing_invoice_not_found');
      }
      if (current.status !== 'failed' && current.status !== 'void') return current;
      const row: SaasBillingInvoice = {
        ...current,
        status: 'draft',
        providerId: input.providerId,
        providerIdempotencyKey: input.providerIdempotencyKey,
        providerInvoiceRef: null,
        providerCheckoutUrl: null,
      };
      invoices.set(row.id, row);
      return row;
    },
  };
}
