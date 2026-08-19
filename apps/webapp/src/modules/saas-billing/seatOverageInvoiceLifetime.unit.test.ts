import { describe, expect, it, vi } from 'vitest';
import { createSaasBillingService } from './service';
import { decideSeatOverage } from './seatOverage';
import { createInMemorySaasBillingRepository } from '@/infra/repos/inMemorySaasBilling';
import type { SeatOverageQuote } from './seatOverageQuote';

/**
 * Р-15 в ДЕЙСТВУЮЩЕЙ редакции (владелец, 19.08): «Место открывается СРАЗУ, пропорциональная
 * доплата уходит в следующий счёт… Счёт живёт заданную ДЛИТЕЛЬНОСТЬ ОТ ВЫСТАВЛЕНИЯ; просроченный
 * ОТМЕНЯЕТСЯ и выставляется новый с пересчитанной суммой, а не продлевается».
 *
 * ⚠️ Смена authority: файл был артефактом слепого аудита 19.08 и закреплял ПРЕЖНЮЮ редакцию —
 * «место открывается только после оплаты», «счёт живёт до конца местных суток». Обе отменены
 * владельцем в тот же день. Что из аудита осталось верным при любой редакции и проверяется здесь
 * по-прежнему: срок счёта обязан существовать на ДЕНЕЖНОМ пути, а не только в колонке (F1), и цена
 * места не может превысить полной цены места (F4).
 */

const quote = (priceMinor: number, purchaseKey: string): SeatOverageQuote => ({
  organizationId: 'org-seat',
  purchaseKey,
  priceMinor,
  currency: 'RUB',
  expiresAt: '2999-01-01T00:00:00.000Z',
});

async function paidClinic(options: { invoiceValidityDays?: number } = {}) {
  let clock = new Date('2026-07-01T00:00:00.000Z');
  const createIntent = vi.fn(async () => ({
    providerIntentRef: 'provider-seat',
    checkoutUrl: 'https://pay.example/seat',
  }));
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
      getSaasBillingPaymentProviderValue: async () =>
        options.invoiceValidityDays === undefined
          ? null
          : { lifecyclePolicy: { invoiceValidityDays: options.invoiceValidityDays } },
    },
    resolvePaymentProvider: () => ({ createIntent }) as never,
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
  const openSeats = async () =>
    (await service.getOrganizationBillingOverview('org-seat')).subscriptions.find(
      (row) => row.source === 'paid_subscription',
    )?.paidAdditionalSeats;
  const invoices = async () =>
    (await service.getOrganizationBillingOverview('org-seat')).invoices;
  return {
    service,
    createIntent,
    openSeats,
    invoices,
    setClock: (iso: string) => {
      clock = new Date(iso);
    },
  };
}

describe('Р-15: место открывается в момент выставления счёта, а не в момент оплаты', () => {
  it('открывает место сразу и не открывает его второй раз при оплате', async () => {
    const { service, openSeats, setClock } = await paidClinic();
    expect(await openSeats()).toBe(0);
    setClock('2026-07-16T12:00:00.000Z');
    const purchase = await service.purchaseSeatOverage({
      organizationId: 'org-seat',
      quote: quote(77_420, 'buy-16-07'),
    });
    if (purchase.outcome !== 'seat_opened') {
      throw new Error(`ожидался seat_opened, получен ${purchase.outcome}`);
    }
    // Деньги ещё не приходили — место уже открыто.
    expect(await openSeats()).toBe(1);

    setClock('2026-07-20T12:00:00.000Z');
    await service.captureSaasBillingProviderWebhookEvent({
      organizationId: 'org-seat',
      saasBillingInvoiceId: purchase.invoice.id,
      providerId: 'mock',
      verified: {
        idempotencyKey: 'seat-payment',
        eventType: 'payment.succeeded',
        amountMinor: 77_420,
        payload: { currency: 'RUB' },
      },
    });
    // Пробивается: приём денег снова увеличивает счётчик, и одно место становится двумя.
    expect(await openSeats()).toBe(1);
  });

  /**
   * Находка F1 слепого аудита в её части, которая верна при любой редакции: срок счёта обязан
   * уходить ПРОВАЙДЕРУ. У ЮKassa счёт по истечении сам переходит в `canceled` — иначе деньги можно
   * принять по мёртвому счёту, а срок остаётся комментарием в базе.
   */
  it('сообщает срок счёта провайдеру, а не только пишет его в свою строку', async () => {
    const { service, createIntent, setClock } = await paidClinic({ invoiceValidityDays: 3 });
    setClock('2026-07-16T12:00:00.000Z');
    const purchase = await service.purchaseSeatOverage({
      organizationId: 'org-seat',
      quote: quote(77_420, 'buy-16-07'),
    });
    if (purchase.outcome !== 'seat_opened') {
      throw new Error(`ожидался seat_opened, получен ${purchase.outcome}`);
    }
    expect(purchase.invoice.expiresAt).toBe('2026-07-19T12:00:00.000Z');
    const seatIntent = (
      createIntent.mock.calls as unknown as Array<
        [{ purpose: string; invoice?: { expiresAt: string } }]
      >
    )
      .map(([params]) => params)
      .find((params) => params.purpose === 'saas_billing_seat_overage');
    expect(seatIntent?.invoice?.expiresAt).toBe('2026-07-19T12:00:00.000Z');
  });

  /**
   * Р-15: «просроченный ОТМЕНЯЕТСЯ и выставляется новый с пересчитанной суммой, а не
   * продлевается». Обе половины — одним действием: отмена без перевыставления списала бы долг
   * молча, перевыставление без отмены дало бы два живых счёта за одно место.
   */
  it('отменяет просроченный счёт и выставляет новый, пересчитанный на новый момент', async () => {
    const { service, openSeats, invoices, setClock } = await paidClinic({ invoiceValidityDays: 3 });
    setClock('2026-07-16T12:00:00.000Z');
    const purchase = await service.purchaseSeatOverage({
      organizationId: 'org-seat',
      quote: quote(77_420, 'buy-16-07'),
    });
    if (purchase.outcome !== 'seat_opened') {
      throw new Error(`ожидался seat_opened, получен ${purchase.outcome}`);
    }

    // Внутри срока перевыставлять нечего.
    setClock('2026-07-18T12:00:00.000Z');
    expect(await service.runDueSeatOverageInvoiceReissues()).toMatchObject({
      dueCount: 0,
      reissued: 0,
    });

    setClock('2026-07-20T12:00:00.000Z');
    const tick = await service.runDueSeatOverageInvoiceReissues();
    expect(tick).toMatchObject({ dueCount: 1, reissued: 1, failed: 0 });

    const rows = await invoices();
    const cancelled = rows.find((row) => row.id === purchase.invoice.id);
    const replacement = rows.find(
      (row) => row.invoiceKind === 'seat_overage' && row.id !== purchase.invoice.id,
    );
    expect(cancelled?.status).toBe('void');
    // Пересчитан на новый момент: остатка стало меньше, значит и сумма меньше прежней.
    expect(replacement?.amountMinor).toBeLessThan(purchase.invoice.amountMinor);
    expect(replacement?.expiresAt).toBe('2026-07-23T12:00:00.000Z');
    // Место при перевыставлении не закрывается и не открывается заново.
    expect(await openSeats()).toBe(1);

    // Повторный тик по тому же счёту не плодит третий: ключ идемпотентности выведен из отменённого.
    expect(await service.runDueSeatOverageInvoiceReissues()).toMatchObject({ dueCount: 0 });
  });
});

/**
 * Граница, потерянная при переезде тестов 19.08 (находка F4) и восстановленная здесь: удалённый
 * `it('costs the full seat price on the first day and one day on the last')` преемника не получил.
 * Действующая редакция Р-15 её не отменяет.
 *
 * Названный отказ: округление остатка ВВЕРХ до целых суток подставляет в формулу момент раньше
 * начала периода, когда длина периода не кратна суткам, — и тогда единственное, что не даёт счёту
 * за место превысить полную цену места, это потолок `Math.min(...)` в `proration.ts`.
 */
describe('Р-15: цена места не превышает полной цены места и не меньше одних суток', () => {
  const seat = {
    includedSeats: 1,
    paidAdditionalSeats: 0,
    used: 1,
    additionalSeatPriceMinor: 150_000,
    currency: 'RUB',
    invoiceValidityDays: 30,
  };

  it('не берёт больше полной цены места в первый день периода, не кратного суткам', () => {
    const offer = decideSeatOverage({
      ...seat,
      // 29 суток 23 часа — столько длится месяц, внутри которого переводят часы.
      currentPeriodStartsAt: '2026-08-01T12:00:00.000Z',
      currentPeriodEndsAt: '2026-08-31T11:00:00.000Z',
      asOf: '2026-08-01T12:00:00.000Z',
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
