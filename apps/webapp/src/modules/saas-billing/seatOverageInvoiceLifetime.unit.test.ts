import { describe, expect, it } from 'vitest';
import { createSaasBillingService } from './service';
import { decideSeatOverage } from './seatOverage';
import { createInMemorySaasBillingRepository } from '@/infra/repos/inMemorySaasBilling';
import type { SeatOverageQuote } from './seatOverageQuote';

/**
 * Слепой аудит решения Р-15 (19.08), реестр
 * `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5а-0. Отчёт:
 * `docs/_TODO/SAAS_FOUNDATION/SEAT_INVOICE_R15_BLIND_AUDIT_2026-08-19.md`.
 *
 * Дверь `seatOverage.ts` ЗАПИСЫВАЕТ в счёт срок «до конца местных суток» — но на денежном пути
 * этот срок не читает никто, и провайдеру он не уходит. Три проверки ниже названы отказами, а не
 * «проверяют корректность» (AGENTS.md §10a):
 *
 * 1. Счёт на место, просроченный по собственному `expires_at`, всё равно открывает место, и
 *    клиника платит цену того дня, когда счёт выписали, за более короткий остаток.
 * 2. Счёт на место, оплаченный после конца оплаченного периода, всё равно открывает место —
 *    ровно тот исход `paid_period_over`, ради запрета которого дверь и делалась.
 * 3. Место на ПЕРВЫЙ день периода, начавшегося в середине суток, стоит дороже полной цены места:
 *    цена считается от местной полуночи, которая лежит раньше начала периода. Потолок
 *    `Math.min(endsAt - startsAt, ...)` в `proration.ts` — единственное, что этого не даёт, и
 *    после переезда тестов 19.08 его не проверяет больше ничто.
 */

const quote = (priceMinor: number, purchaseKey: string): SeatOverageQuote => ({
  organizationId: 'org-seat',
  purchaseKey,
  priceMinor,
  currency: 'RUB',
  expiresAt: '2999-01-01T00:00:00.000Z',
});

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
    settings: { getSaasBillingPaymentProviderValue: async () => null },
    resolvePaymentProvider: () =>
      ({
        createIntent: async () => ({
          providerIntentRef: 'provider-seat',
          checkoutUrl: 'https://pay.example/seat',
        }),
      }) as never,
    now: () => clock,
  });
  await service.assignManualTariff({
    organizationId: 'org-seat',
    tariffId: 'tariff-seat',
    audit: { actorId: 'admin', reason: 'seed' },
  });
  // Оплаченный период 01.07 → 01.08.
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
  const paidSeats = async () =>
    (await service.getOrganizationBillingOverview('org-seat')).subscriptions.find(
      (row) => row.source === 'paid_subscription',
    )?.paidAdditionalSeats;
  return { service, paidSeats, setClock: (iso: string) => { clock = new Date(iso); } };
}

describe('Р-15: срок жизни счёта на место действует в момент оплаты, а не только на экране', () => {
  it('не открывает место по счёту, просроченному по его собственному expires_at', async () => {
    const { service, paidSeats, setClock } = await paidClinic();
    setClock('2026-07-16T12:00:00.000Z');
    const purchase = await service.purchaseSeatOverage({
      organizationId: 'org-seat',
      quote: quote(78_025, 'buy-16-07'),
    });
    if (purchase.outcome !== 'checkout') throw new Error(`ожидался checkout, получен ${purchase.outcome}`);
    // Сутки клиники (МСК) кончаются 16.07 21:00 UTC — это и есть срок счёта.
    expect(purchase.invoice.expiresAt).toBe('2026-07-16T21:00:00.000Z');

    // Клиника платит четверо суток спустя. Р-15: «Не оплатили до конца суток? Значит счёт не
    // актуален, надо перевыставить заново» — по этому счёту место открываться не должно.
    setClock('2026-07-20T12:00:00.000Z');
    await service.captureSaasBillingProviderWebhookEvent({
      organizationId: 'org-seat',
      saasBillingInvoiceId: purchase.invoice.id,
      providerId: 'mock',
      verified: {
        idempotencyKey: 'late-payment',
        eventType: 'payment.succeeded',
        amountMinor: 78_025,
        payload: { currency: 'RUB' },
      },
    });
    expect(await paidSeats()).toBe(0);
  });

  it('не открывает место по счёту, оплаченному после конца оплаченного периода', async () => {
    const { service, paidSeats, setClock } = await paidClinic();
    setClock('2026-07-31T12:00:00.000Z');
    const purchase = await service.purchaseSeatOverage({
      organizationId: 'org-seat',
      quote: quote(5_444, 'buy-31-07'),
    });
    if (purchase.outcome !== 'checkout') throw new Error(`ожидался checkout, получен ${purchase.outcome}`);
    expect(purchase.invoice.servicePeriodEndsAt).toBe('2026-08-01T00:00:00.000Z');

    setClock('2026-08-05T12:00:00.000Z');
    await service.captureSaasBillingProviderWebhookEvent({
      organizationId: 'org-seat',
      saasBillingInvoiceId: purchase.invoice.id,
      providerId: 'mock',
      verified: {
        idempotencyKey: 'payment-after-period',
        eventType: 'payment.succeeded',
        amountMinor: 5_444,
        payload: { currency: 'RUB' },
      },
    });
    expect(await paidSeats()).toBe(0);
  });
});

/**
 * Граница, потерянная при переезде тестов 19.08: удалённый `it('costs the full seat price on the
 * first day and one day on the last')` преемника не получил. Р-15 её не отменяет — он отменил
 * только «полная цена при НУЛЕВОМ остатке». Проверено инъекцией: снятие потолка в `proration.ts`
 * оставляет весь набор зелёным, а первый день начинает стоить 1525 ₽ вместо 1500 ₽.
 */
describe('Р-15: цена места не превышает полной цены места и не меньше одних суток', () => {
  const seat = {
    includedSeats: 1,
    paidAdditionalSeats: 0,
    used: 1,
    additionalSeatPriceMinor: 150_000,
    currency: 'RUB',
    timeZone: 'UTC',
  };

  it('не берёт больше полной цены места за первый день периода, начавшегося в середине суток', () => {
    const offer = decideSeatOverage({
      ...seat,
      currentPeriodStartsAt: '2026-08-01T12:00:00.000Z',
      currentPeriodEndsAt: '2026-08-31T12:00:00.000Z',
      asOf: '2026-08-01T13:00:00.000Z',
    });
    expect(offer.outcome === 'purchasable' && offer.priceMinor).toBe(150_000);
  });

  it('берёт одни сутки за место, открытое в последние сутки периода', () => {
    const offer = decideSeatOverage({
      ...seat,
      currentPeriodStartsAt: '2026-08-01T00:00:00.000Z',
      currentPeriodEndsAt: '2026-08-31T00:00:00.000Z',
      asOf: '2026-08-30T18:00:00.000Z',
    });
    expect(offer.outcome === 'purchasable' && offer.priceMinor).toBe(5_000);
  });
});
