import { describe, expect, it, vi } from 'vitest';
import { createSaasBillingService } from './service';
import { createInMemorySaasBillingRepository } from '@/infra/repos/inMemorySaasBilling';
import type { SeatOverageQuote } from './seatOverageQuote';

/**
 * Артефакт слепого аудита 19.08 (второй проход),
 * `docs/_TODO/SAAS_FOUNDATION/SEAT_INVOICE_R15_BLIND_AUDIT_2_2026-08-19.md`, находка F-B.
 *
 * Oracle — Р-15 в действующей редакции, реестр §5а-0 `TARIFFS_PAYMENTS_ADMIN_PLAN.md`:
 * «Место открывается СРАЗУ… Отдельным счётом место оплачивается один раз, НА МОМЕНТ ОТКРЫТИЯ; со
 * следующего периода стоимость входит в общий счёт».
 *
 * Названный отказ: клиника открыла место и не заплатила; срок счёта вышел, счёт ушёл в `void` и
 * оплатить его больше нельзя, а новый посчитан ОТ МОМЕНТА ПЕРЕВЫСТАВЛЕНИЯ — поэтому отрезок «от
 * открытия места до перевыставления» не покрывает ни один счёт. Место работало, денег за него нет.
 * Прежней редакции («место только после оплаты») этого отказа не существовало.
 *
 * Что должно быть: сумма, которую клиника ещё может заплатить за это место, покрывает отрезок от
 * ОТКРЫТИЯ места до конца оплаченного периода — то есть не убывает от того, что клиника тянет.
 */

const quote = (priceMinor: number, purchaseKey: string): SeatOverageQuote => ({
  organizationId: 'org-seat',
  purchaseKey,
  priceMinor,
  currency: 'RUB',
  expiresAt: '2999-01-01T00:00:00.000Z',
});

/** Оплаченный период 01.07 → 01.08 (31 сутки), место 1500,00 ₽. */
async function paidClinic(invoiceValidityDays: number) {
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
      getSaasBillingPaymentProviderValue: async () => ({
        lifecyclePolicy: { invoiceValidityDays },
      }),
    },
    resolvePaymentProvider: () => ({ createIntent }) as never,
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
  const seatInvoices = async () =>
    (await service.getOrganizationBillingOverview('org-seat')).invoices.filter(
      (row) => row.invoiceKind === 'seat_overage',
    );
  const stillOwedMinor = async () =>
    (await seatInvoices())
      .filter((row) => row.status === 'draft' || row.status === 'pending')
      .reduce((sum, row) => sum + row.amountMinor, 0);
  const openSeats = async () =>
    (await service.getOrganizationBillingOverview('org-seat')).subscriptions.find(
      (row) => row.source === 'paid_subscription',
    )?.paidAdditionalSeats;
  return { service, stillOwedMinor, openSeats, setClock: (iso: string) => { clock = new Date(iso); } };
}

describe('Р-15: неоплаченное место не дешевеет от того, что клиника тянет', () => {
  /**
   * Настройки ПО УМОЛЧАНИЮ: срок счёта 30 суток, период 31 сутки. Одного перевыставления хватает,
   * чтобы списать 30 суток из 31 — ошибки администратора для этого не нужно.
   */
  it('не списывает месяц пользования местом при сроке счёта по умолчанию', async () => {
    const { service, stillOwedMinor, openSeats, setClock } = await paidClinic(30);
    setClock('2026-07-01T00:00:00.001Z');
    const purchase = await service.purchaseSeatOverage({
      organizationId: 'org-seat',
      quote: quote(150_000, 'buy-01-07'),
    });
    if (purchase.outcome !== 'seat_opened') {
      throw new Error(`ожидался seat_opened, получен ${purchase.outcome}`);
    }
    expect(purchase.invoice.amountMinor).toBe(150_000);

    // Клиника не платит ничего; часовой тик биллинга идёт своим чередом.
    for (const iso of [
      '2026-07-15T00:00:00.000Z',
      '2026-07-31T12:00:00.000Z',
    ]) {
      setClock(iso);
      await service.runDueSeatOverageInvoiceReissues();
    }

    // Место работало весь период — значит и заплатить за него можно по-прежнему полную цену.
    expect(await openSeats()).toBe(1);
    expect(await stillOwedMinor()).toBe(150_000);
  });

  /**
   * Та же поломка на коротком настроенном сроке («оплатите в течение трёх суток») — эрозия
   * становится циклической: каждое перевыставление списывает очередные трое суток.
   */
  it('не списывает потреблённое место при коротком сроке счёта', async () => {
    const { service, stillOwedMinor, openSeats, setClock } = await paidClinic(3);
    setClock('2026-07-03T00:00:00.000Z');
    const purchase = await service.purchaseSeatOverage({
      organizationId: 'org-seat',
      quote: quote(140_323, 'buy-03-07'),
    });
    if (purchase.outcome !== 'seat_opened') {
      throw new Error(`ожидался seat_opened, получен ${purchase.outcome}`);
    }
    const openedFor = purchase.invoice.amountMinor;

    for (let day = 4; day <= 31; day += 1) {
      setClock(`2026-07-${String(day).padStart(2, '0')}T00:00:00.000Z`);
      await service.runDueSeatOverageInvoiceReissues();
    }

    expect(await openSeats()).toBe(1);
    expect(await stillOwedMinor()).toBe(openedFor);
  });
});
