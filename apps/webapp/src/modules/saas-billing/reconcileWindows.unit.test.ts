import { describe, expect, it } from 'vitest';
import { createSaasBillingService } from './service';
import type {
  SaasBillingPlatformInvoiceFilter,
  SaasBillingPlatformInvoiceRow,
  SaasBillingRepositoryPort,
} from './ports';
import type { PaymentProviderListedPayment, PaymentProviderPort } from '@/modules/payments/providerPort';

/**
 * Этап 1, пункт 1.4. Both directions of the reconciliation used to be cut by ONE window over
 * `createdAt`, which made an invoice raised a month ago and paid today a permanent discrepancy in
 * both directions at once: absent from this period's journal slice, and its payment absent from
 * the journal it was compared against. A scheduled sweep on that comparison pages the owner about
 * healthy invoices forever.
 */

const PERIOD_FROM = '2026-08-18T00:00:00.000Z';
const PERIOD_TO = '2026-08-18T23:59:59.999Z';

function journalRow(overrides: Partial<SaasBillingPlatformInvoiceRow>): SaasBillingPlatformInvoiceRow {
  return {
    id: 'invoice-old',
    organizationId: 'org-1',
    organizationTitle: 'Клиника',
    saasBillingAccountId: 'account-1',
    saasBillingSubscriptionId: 'subscription-1',
    tariffId: 'tariff-1',
    tariffName: 'Стандарт',
    invoiceKind: 'tariff_period',
    additionalSeatQuantity: 0,
    description: null,
    amountMinor: 490_000,
    currency: 'RUB',
    tariffBillingPeriod: 'month',
    servicePeriodStartsAt: '2026-07-18T00:00:00.000Z',
    servicePeriodEndsAt: '2026-08-18T00:00:00.000Z',
    expiresAt: '2026-08-17T00:00:00.000Z',
    status: 'paid',
    providerId: 'yookassa',
    providerInvoiceRef: 'in-9021',
    providerCheckoutUrl: null,
    providerIdempotencyKey: 'key-1',
    // Raised a month before the window, money arrived INSIDE it.
    paidAt: '2026-08-18T09:00:00.000Z',
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-08-18T09:00:00.000Z',
    refundedMinor: 0,
    pendingRefundMinor: 0,
    ...overrides,
  } as SaasBillingPlatformInvoiceRow;
}

const providerPayment: PaymentProviderListedPayment = {
  providerPaymentRef: 'in-9021',
  status: 'succeeded',
  amountMinor: 490_000,
  currency: 'RUB',
  refundedAmountMinor: 0,
};

function createService(rows: SaasBillingPlatformInvoiceRow[], items: PaymentProviderListedPayment[]) {
  const filters: SaasBillingPlatformInvoiceFilter[] = [];
  const repository = {
    listPlatformInvoices: async (filter: SaasBillingPlatformInvoiceFilter) => {
      filters.push(filter);
      if (filter.providerInvoiceRefs) {
        return rows.filter(
          (row) =>
            row.providerInvoiceRef !== null &&
            filter.providerInvoiceRefs!.includes(row.providerInvoiceRef),
        );
      }
      return rows.filter(
        (row) =>
          row.paidAt !== null &&
          (!filter.paidFrom || row.paidAt >= filter.paidFrom) &&
          (!filter.paidTo || row.paidAt <= filter.paidTo),
      );
    },
  } as unknown as SaasBillingRepositoryPort;

  const service = createSaasBillingService({
    repository,
    settings: {
      getSaasBillingPaymentProviderValue: async () => ({
        defaultProviderId: 'yookassa',
        providers: [
          { id: 'yookassa', label: 'ЮKassa', enabled: true, webhookSecret: 'x', shopId: 's', apiKey: 'k' },
        ],
      }),
    },
    resolvePaymentProvider: () =>
      ({
        listPayments: async () => ({ items, truncated: false }),
      }) as unknown as PaymentProviderPort,
    now: () => new Date(PERIOD_TO),
  });
  return { service, filters };
}

describe('свёрка: у каждой стороны своё окно', () => {
  it('счёт, выставленный месяц назад и оплаченный сегодня, расхождением не является', async () => {
    const { service, filters } = createService([journalRow({})], [providerPayment]);

    const result = await service.reconcilePlatformPaymentsWithProvider({
      periodFrom: PERIOD_FROM,
      periodTo: PERIOD_TO,
    });

    expect(result.outcome).toBe('ok');
    if (result.outcome !== 'ok') return;
    expect(result.discrepancies).toEqual([]);
    expect(result.journalCount).toBe(1);

    // Журнал → провайдер: окно по дате ОПЛАТЫ, не по дате выставления.
    expect(filters[0]).toEqual({ paidFrom: PERIOD_FROM, paidTo: PERIOD_TO });
    // Провайдер → журнал: точечный поиск по ref, без единой даты в запросе.
    expect(filters[1]).toEqual({ providerInvoiceRefs: ['in-9021'] });
  });

  it('платёж провайдера, которого нет в журнале, остаётся расхождением', async () => {
    const { service } = createService(
      [],
      [{ ...providerPayment, providerPaymentRef: 'in-unknown' }],
    );

    const result = await service.reconcilePlatformPaymentsWithProvider({
      periodFrom: PERIOD_FROM,
      periodTo: PERIOD_TO,
    });

    expect(result.outcome).toBe('ok');
    if (result.outcome !== 'ok') return;
    expect(result.discrepancies).toEqual([
      {
        kind: 'missing_in_journal',
        providerPaymentRef: 'in-unknown',
        providerStatus: 'succeeded',
        amountMinor: 490_000,
        currency: 'RUB',
      },
    ]);
  });

  it('оплаченный у нас счёт, которого нет у провайдера, остаётся расхождением', async () => {
    const { service } = createService([journalRow({})], []);

    const result = await service.reconcilePlatformPaymentsWithProvider({
      periodFrom: PERIOD_FROM,
      periodTo: PERIOD_TO,
    });

    expect(result.outcome).toBe('ok');
    if (result.outcome !== 'ok') return;
    expect(result.discrepancies).toEqual([
      {
        kind: 'missing_in_provider',
        saasBillingInvoiceId: 'invoice-old',
        organizationTitle: 'Клиника',
        providerInvoiceRef: 'in-9021',
        amountMinor: 490_000,
        currency: 'RUB',
      },
    ]);
  });
});
