import { describe, expect, it, vi } from 'vitest';
import { createSaasBillingService } from './service';
import { createInMemorySaasBillingRepository } from '@/infra/repos/inMemorySaasBilling';
import type { SeatOverageQuote } from './seatOverageQuote';

/**
 * Находка F-C слепого аудита 19.08,
 * `docs/_TODO/SAAS_FOUNDATION/SEAT_INVOICE_R15_BLIND_AUDIT_2_2026-08-19.md`.
 *
 * Названный отказ: администратор отменяет неоплаченный счёт за место («клиника попросила») —
 * счёт уходит в `void`, а место остаётся открытым до конца оплаченного периода бесплатно, потому
 * что в действующей редакции Р-15 доступ даёт счётчик `paidAdditionalSeats`, а не платёж. Цена
 * отказа — полная цена места (1500,00 ₽ при месячном месте 1500 ₽), и повторные отмены копят
 * места: две отмены — два подаренных места.
 *
 * Отличие от перевыставления: там отменённому счёту сразу приходит замена за ту же услугу, и
 * место закрывать НЕЛЬЗЯ. Здесь замены нет — значит нет и услуги.
 */

const quote = (priceMinor: number, purchaseKey: string): SeatOverageQuote => ({
  organizationId: 'org-seat',
  purchaseKey,
  priceMinor,
  currency: 'RUB',
  expiresAt: '2999-01-01T00:00:00.000Z',
});

/** Оплаченный период 01.07 → 01.08 (31 сутки), место 1500,00 ₽. */
async function paidClinic() {
  let clock = new Date('2026-07-01T00:00:00.000Z');
  const repository = createInMemorySaasBillingRepository({
    tariffs: [
      {
        id: 'tariff-seat',
        name: 'Клиника',
        priceMinor: 500_000,
        currency: 'RUB',
        billingPeriod: 'month',
        additionalSeatPriceMinor: 150_000,
      },
    ],
    trialPolicy: null,
    now: () => clock,
  });
  const service = createSaasBillingService({
    repository,
    settings: {
      getSaasBillingPaymentProviderValue: async () => ({
        lifecyclePolicy: { invoiceValidityDays: 30 },
      }),
    },
    resolvePaymentProvider: () =>
      ({
        createIntent: vi.fn(async () => ({
          providerIntentRef: 'provider-seat',
          checkoutUrl: 'https://pay.example/seat',
        })),
      }) as never,
    now: () => clock,
  });
  await service.assignManualTariff({
    organizationId: 'org-seat',
    tariffId: 'tariff-seat',
    audit: { actorId: 'admin', reason: 'seed' },
  });
  const period = await service.createOwnTariffRenewalInvoice('org-seat');
  await service.captureSaasBillingProviderWebhookEvent({
    organizationId: 'org-seat',
    saasBillingInvoiceId: period.id,
    providerId: 'mock',
    verified: {
      idempotencyKey: 'seed-period',
      eventType: 'payment.succeeded',
      amountMinor: 500_000,
      payload: { currency: 'RUB' },
    },
  });
  const openSeats = async () =>
    (await service.getOrganizationBillingOverview('org-seat')).subscriptions.find(
      (row) => row.source === 'paid_subscription',
    )?.paidAdditionalSeats;
  return { service, openSeats, setClock: (iso: string) => { clock = new Date(iso); } };
}

describe('Р-15: отменённый счёт за место не оставляет место открытым', () => {
  it('закрывает место, когда администратор отменяет неоплаченный счёт за него', async () => {
    const { service, openSeats, setClock } = await paidClinic();
    setClock('2026-07-01T00:00:00.001Z');
    const purchase = await service.purchaseSeatOverage({
      organizationId: 'org-seat',
      quote: quote(150_000, 'buy-01-07'),
    });
    if (purchase.outcome !== 'seat_opened') {
      throw new Error(`ожидался seat_opened, получен ${purchase.outcome}`);
    }
    expect(await openSeats()).toBe(1);

    const cancelled = await service.cancelSaasBillingInvoice({
      saasBillingInvoiceId: purchase.invoice.id,
      actorId: 'admin',
      reason: 'клиника попросила отменить',
    });
    expect(cancelled.outcome).toBe('cancelled');
    expect(cancelled.outcome === 'cancelled' && cancelled.invoice.status).toBe('void');
    expect(await openSeats()).toBe(0);
  });

  /** Отмена счёта за ТАРИФ мест не касается: их открывал не он. */
  it('не трогает счётчик мест при отмене счёта за период тарифа', async () => {
    const { service, openSeats, setClock } = await paidClinic();
    setClock('2026-07-01T00:00:00.001Z');
    const purchase = await service.purchaseSeatOverage({
      organizationId: 'org-seat',
      quote: quote(150_000, 'buy-01-07'),
    });
    if (purchase.outcome !== 'seat_opened') {
      throw new Error(`ожидался seat_opened, получен ${purchase.outcome}`);
    }
    setClock('2026-08-01T00:00:00.000Z');
    const nextPeriod = await service.createOwnTariffRenewalInvoice('org-seat');

    const cancelled = await service.cancelSaasBillingInvoice({
      saasBillingInvoiceId: nextPeriod.id,
      actorId: 'admin',
      reason: 'ошиблись счётом',
    });
    expect(cancelled.outcome).toBe('cancelled');
    expect(await openSeats()).toBe(1);
  });
});
