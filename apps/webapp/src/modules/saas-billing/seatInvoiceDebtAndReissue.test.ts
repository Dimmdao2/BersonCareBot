/**
 * Счёт за место, оставшийся неоплаченным: что с ним можно сделать и куда девается долг.
 *
 * Решения владельца 19.08, дословно:
 *   «отмена неоплаченного счёта администратором — это с чего бы его отменять? … Может
 *   перевыставить его».
 *   «Если до конца периода счет не оплачен — делать его просроченным и включать долг в стоимость
 *   следующего периода: он либо автооплатится, либо весь доступ закрыт по правилам тарифов».
 *
 * Поломки, которые ловит этот файл:
 * 1. «Счёт за место отменили — оказанная услуга не будет оплачена никогда, а журнал говорит
 *    „счёта не было“».
 * 2. «Перевыставление пересчитало сумму на момент перевыставления — место подешевело за то, что
 *    клиника тянула с оплатой».
 * 3. «Период кончился, счёт за место не оплачен — долг просто исчез: следующий счёт выставлен по
 *    цене тарифа».
 * 4. «Долг переехал в следующий счёт — и заодно отобрали место за уже прошедший период».
 *
 * Все четыре дорогие и молчаливые: наружу это выглядит как нормально работающий биллинг.
 */
import { describe, expect, it, vi } from 'vitest';
import { createSaasBillingService } from './service';
import { createInMemorySaasBillingRepository } from '@/infra/repos/inMemorySaasBilling';
import type { PaymentProviderPort } from '@/modules/payments/providerPort';

const TARIFF = {
  id: 'tariff-seat',
  name: 'Стандарт',
  priceMinor: 500_000,
  currency: 'RUB',
  billingPeriod: 'month',
  additionalSeatPriceMinor: 150_000,
};

const ORGANIZATION_ID = 'org-seat-debt';
const PERIOD_STARTS_AT = '2026-07-01T00:00:00.000Z';
const PERIOD_ENDS_AT = '2026-08-01T00:00:00.000Z';

function scenario() {
  let clock = new Date(PERIOD_STARTS_AT);
  const repository = createInMemorySaasBillingRepository({ tariffs: [TARIFF] });
  const createIntent = vi.fn(
    async (input: Parameters<PaymentProviderPort['createIntent']>[0]) => ({
      providerIntentRef: `intent-${input.subjectRef}`,
      checkoutUrl: `https://pay.example/${input.subjectRef}`,
    }),
  );
  const service = createSaasBillingService({
    repository,
    settings: { getSaasBillingPaymentProviderValue: async () => null },
    resolvePaymentProvider: () => ({ createIntent }) as never,
    now: () => clock,
  });
  return {
    repository,
    service,
    createIntent,
    setNow(value: string) {
      clock = new Date(value);
    },
    async pay(saasBillingInvoiceId: string, eventId: string) {
      await service.captureSaasBillingProviderWebhookEvent({
        organizationId: ORGANIZATION_ID,
        saasBillingInvoiceId,
        providerId: 'mock',
        verified: {
          idempotencyKey: eventId,
          eventType: 'payment.succeeded',
          amountMinor: 0,
          payload: { currency: 'RUB' },
        },
      });
    },
    /** Цену места считает сервер; тест её не выдумывает, а спрашивает заведомо неверной котировкой. */
    async serverSeatPrice(purchaseKey: string) {
      const probe = await service.purchaseSeatOverage({
        organizationId: ORGANIZATION_ID,
        quote: {
          organizationId: ORGANIZATION_ID,
          purchaseKey,
          priceMinor: 1,
          currency: 'RUB',
          expiresAt: '2999-01-01T00:00:00.000Z',
        },
      });
      if (probe.outcome !== 'price_changed') {
        throw new Error(`test_seed_seat_price_probe_failed:${probe.outcome}`);
      }
      return probe.priceMinor;
    },
    async buySeat(purchaseKey: string) {
      const priceMinor = await this.serverSeatPrice(purchaseKey);
      const result = await service.purchaseSeatOverage({
        organizationId: ORGANIZATION_ID,
        quote: {
          organizationId: ORGANIZATION_ID,
          purchaseKey,
          priceMinor,
          currency: 'RUB',
          expiresAt: '2999-01-01T00:00:00.000Z',
        },
      });
      if (result.outcome !== 'checkout') {
        throw new Error(`test_seed_seat_purchase_failed:${result.outcome}`);
      }
      return result.invoice;
    },
    async invoices() {
      return (await repository.getOrganizationBillingOverview(ORGANIZATION_ID)).invoices;
    },
    async subscription() {
      const overview = await repository.getOrganizationBillingOverview(ORGANIZATION_ID);
      const row = overview.subscriptions.find((entry) => entry.source === 'paid_subscription');
      if (!row) throw new Error('test_seed_subscription_missing');
      return row;
    },
  };
}

/** Оплаченный период, в который можно продавать места. */
async function withPaidPeriod(world: ReturnType<typeof scenario>) {
  await world.service.assignManualTariff({
    organizationId: ORGANIZATION_ID,
    tariffId: TARIFF.id,
    audit: { actorId: 'platform-admin', reason: 'test seed' },
  });
  const periodInvoice = await world.service.createOwnTariffRenewalInvoice(ORGANIZATION_ID);
  await world.pay(periodInvoice.id, 'event-period-1');
  return periodInvoice;
}

describe('счёт за место не отменяют', () => {
  it('маршрутный вызов отмены отвергается на уровне репозитория, а не только кнопкой', async () => {
    const world = scenario();
    await withPaidPeriod(world);
    const seatInvoice = await world.buySeat('seat-1');

    const result = await world.service.cancelSaasBillingInvoice({
      saasBillingInvoiceId: seatInvoice.id,
      actorId: 'platform-admin',
      reason: 'передумали',
    });

    expect(result.outcome).toBe('seat_invoice_not_cancellable');
    // `pending` — счёт с открытым заказом у провайдера, то есть по-прежнему оплачиваемый.
    const stored = (await world.invoices()).find((row) => row.id === seatInvoice.id);
    expect(stored?.status).toBe('pending');
  });

  it('счёт за период тарифа отменяется по-прежнему', async () => {
    const world = scenario();
    await world.service.assignManualTariff({
      organizationId: ORGANIZATION_ID,
      tariffId: TARIFF.id,
      audit: { actorId: 'platform-admin', reason: 'test seed' },
    });
    const periodInvoice = await world.service.createOwnTariffRenewalInvoice(ORGANIZATION_ID);

    const result = await world.service.cancelSaasBillingInvoice({
      saasBillingInvoiceId: periodInvoice.id,
      actorId: 'platform-admin',
      reason: 'выставлен ошибочно',
    });

    expect(result.outcome).toBe('cancelled');
  });
});

describe('перевыставление счёта за место', () => {
  it('создаёт преемника на тот же отрезок услуги и ту же сумму, старый гасит ссылкой на него', async () => {
    const world = scenario();
    await withPaidPeriod(world);
    const seatInvoice = await world.buySeat('seat-1');

    world.setNow('2026-07-20T00:00:00.000Z');
    const result = await world.service.reissueSeatOverageInvoice({
      saasBillingInvoiceId: seatInvoice.id,
      actorId: 'platform-admin',
      reason: 'счёт протух у провайдера',
    });

    expect(result.outcome).toBe('reissued');
    if (result.outcome !== 'reissued') throw new Error('reissued expected');

    // Сумма и отрезок услуги — те же: перевыставление не даёт скидки за просрочку.
    expect(result.invoice.amountMinor).toBe(seatInvoice.amountMinor);
    expect(result.invoice.servicePeriodStartsAt).toBe(seatInvoice.servicePeriodStartsAt);
    expect(result.invoice.servicePeriodEndsAt).toBe(seatInvoice.servicePeriodEndsAt);
    expect(result.invoice.id).not.toBe(seatInvoice.id);
    expect(result.invoice.status).toBe('pending');

    // Старый погашен и указывает на преемника — это «сумма на том счёте», а не «долга не было».
    const stored = (await world.invoices()).find((row) => row.id === seatInvoice.id);
    expect(stored?.status).toBe('void');
    expect(stored?.supersededByInvoiceId).toBe(result.invoice.id);
  });

  it('повторное перевыставление того же счёта не плодит третий счёт', async () => {
    const world = scenario();
    await withPaidPeriod(world);
    const seatInvoice = await world.buySeat('seat-1');

    await world.service.reissueSeatOverageInvoice({
      saasBillingInvoiceId: seatInvoice.id,
      actorId: 'platform-admin',
      reason: 'первый раз',
    });
    const second = await world.service.reissueSeatOverageInvoice({
      saasBillingInvoiceId: seatInvoice.id,
      actorId: 'platform-admin',
      reason: 'второй раз',
    });

    expect(second.outcome).toBe('invoice_not_reissuable');
    expect((await world.invoices()).filter((row) => row.invoiceKind === 'seat_overage')).toHaveLength(
      2,
    );
  });

  it('оставляет старый счёт живым, когда создание преемника упало', async () => {
    const world = scenario();
    await withPaidPeriod(world);
    const seatInvoice = await world.buySeat('seat-1');

    // Инъекция ровно в шаг «создать новый»: всё, что было до него, обязано остаться как было.
    vi.spyOn(world.repository, 'reissueSeatOverageInvoice').mockImplementationOnce(async () => {
      throw new Error('insert_failed');
    });

    await expect(
      world.service.reissueSeatOverageInvoice({
        saasBillingInvoiceId: seatInvoice.id,
        actorId: 'platform-admin',
        reason: 'падение',
      }),
    ).rejects.toThrow('insert_failed');

    const stored = (await world.invoices()).find((row) => row.id === seatInvoice.id);
    expect(stored?.status).toBe('pending');
    expect(stored?.supersededByInvoiceId).toBeNull();
  });
});

describe('неоплаченный к концу периода счёт за место едет строкой в следующий счёт', () => {
  it('добавляет долг к сумме следующего периода и гасит его преемником', async () => {
    const world = scenario();
    await withPaidPeriod(world);
    const paidSeat = await world.buySeat('seat-paid');
    await world.pay(paidSeat.id, 'event-seat-paid');
    const unpaidSeat = await world.buySeat('seat-unpaid');

    // Место, за которое заплатили, открыто; неоплаченное — нет.
    expect((await world.subscription()).paidAdditionalSeats).toBe(1);

    world.setNow(PERIOD_ENDS_AT);
    const nextPeriod = await world.service.createOwnTariffRenewalInvoice(ORGANIZATION_ID);

    // Долг вошёл строкой: сумма = цена тарифа + неоплаченное место.
    expect(nextPeriod.carriedDebtMinor).toBe(unpaidSeat.amountMinor);
    expect(nextPeriod.amountMinor).toBe(TARIFF.priceMinor + unpaidSeat.amountMinor);
    expect(nextPeriod.servicePeriodStartsAt).toBe(PERIOD_ENDS_AT);

    // Старый счёт за место больше не стоит сам по себе — иначе клиника заплатила бы дважды.
    const storedUnpaid = (await world.invoices()).find((row) => row.id === unpaidSeat.id);
    expect(storedUnpaid?.status).toBe('void');
    expect(storedUnpaid?.supersededByInvoiceId).toBe(nextPeriod.id);
  });

  it('не отбирает место за уже прошедший период: услуга оказана', async () => {
    const world = scenario();
    await withPaidPeriod(world);
    const paidSeat = await world.buySeat('seat-paid');
    await world.pay(paidSeat.id, 'event-seat-paid');
    await world.buySeat('seat-unpaid');

    world.setNow(PERIOD_ENDS_AT);
    await world.service.createOwnTariffRenewalInvoice(ORGANIZATION_ID);

    expect((await world.subscription()).paidAdditionalSeats).toBe(1);
  });

  it('не трогает счёт за место, чей отрезок услуги ещё идёт', async () => {
    const world = scenario();
    await withPaidPeriod(world);
    const seatInvoice = await world.buySeat('seat-1');

    // Клиника платит за следующий период досрочно, посреди текущего.
    world.setNow('2026-07-20T00:00:00.000Z');
    const nextPeriod = await world.service.createOwnTariffRenewalInvoice(ORGANIZATION_ID);

    expect(nextPeriod.carriedDebtMinor).toBe(0);
    const stored = (await world.invoices()).find((row) => row.id === seatInvoice.id);
    expect(stored?.status).toBe('pending');
  });

  it('фоновый тик продления считает долг тем же правилом, что и клиника', async () => {
    const world = scenario();
    await withPaidPeriod(world);
    const unpaidSeat = await world.buySeat('seat-unpaid');

    world.setNow('2026-08-01T03:00:00.000Z');
    const outcome = await world.service.runDueSaasBillingRenewals({});

    expect(outcome.created).toBe(1);
    const nextPeriod = (await world.invoices()).find(
      (row) => row.invoiceKind === 'tariff_period' && row.servicePeriodStartsAt === PERIOD_ENDS_AT,
    );
    expect(nextPeriod?.carriedDebtMinor).toBe(unpaidSeat.amountMinor);
    expect(nextPeriod?.amountMinor).toBe(TARIFF.priceMinor + unpaidSeat.amountMinor);
    const storedUnpaid = (await world.invoices()).find((row) => row.id === unpaidSeat.id);
    expect(storedUnpaid?.status).toBe('void');
    expect(storedUnpaid?.supersededByInvoiceId).toBe(nextPeriod?.id);
  });
});
