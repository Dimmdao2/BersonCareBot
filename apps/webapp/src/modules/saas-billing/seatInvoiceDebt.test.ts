/**
 * Счёт за место, оставшийся неоплаченным: что с ним можно сделать и куда девается долг.
 *
 * Решения владельца:
 *   19.08, дословно: «отмена неоплаченного счёта администратором — это с чего бы его отменять? …».
 *   19.08, дословно: «Если до конца периода счет не оплачен — делать его просроченным и включать
 *   долг в стоимость следующего периода: он либо автооплатится, либо весь доступ закрыт по правилам
 *   тарифов».
 *   20.08 (Р-19), дословно: «У него срок до конца период, потом он протух и долг включился в
 *   стоимость следующего периода … срок у счёта ОДИН — конец периода». Перевыставления нет.
 *
 * Поломки, которые ловит этот файл:
 * 1. «Счёт за место отменили — оказанная услуга не будет оплачена никогда, а журнал говорит
 *    „счёта не было“».
 * 2. «Период кончился, счёт за место не оплачен — долг просто исчез: следующий счёт выставлен по
 *    цене тарифа».
 * 3. «Долг переехал в следующий счёт — и заодно отобрали место за уже прошедший период».
 *
 * Все три дорогие и молчаливые: наружу это выглядит как нормально работающий биллинг.
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
  // Момент продажи места решает репозиторий (единственная дверь, `decideSeatOverage`), не
  // сценарий, — общие часы обязаны идти и сюда, иначе двойник спросит настоящее «сейчас».
  const repository = createInMemorySaasBillingRepository({ tariffs: [TARIFF], now: () => clock });
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
      if (result.outcome !== 'seat_opened') {
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

describe('неоплаченный к концу периода счёт за место едет строкой в следующий счёт', () => {
  it('добавляет долг к сумме следующего периода и гасит его преемником', async () => {
    const world = scenario();
    await withPaidPeriod(world);
    const paidSeat = await world.buySeat('seat-paid');
    await world.pay(paidSeat.id, 'event-seat-paid');
    const unpaidSeat = await world.buySeat('seat-unpaid');

    // Р-15 (действующая редакция): место открывается СРАЗУ выставлением счёта, а не платежом —
    // открыты оба, оплачено только одно. Именно поэтому за неоплаченное остаётся долг ниже, а не
    // просто закрытое место.
    expect((await world.subscription()).paidAdditionalSeats).toBe(2);

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

    // Оба места (оплаченное и то, чей долг только что унесло строкой в новый счёт) остаются
    // открытыми — продление не отбирает место задним числом за отрезок, который уже прошёл и
    // услугу по которому клиника уже оказала (Р-18).
    expect((await world.subscription()).paidAdditionalSeats).toBe(2);
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

/**
 * Поломка, которую ловит этот блок, одной строкой: «клиника заплатила по старой живой ссылке
 * провайдера после того, как долг переехал в счёт следующего периода, — списание прошло, а те же
 * деньги остались строкой внутри нового счёта».
 *
 * Отказ дорогой и молчаливый одновременно: провайдер списывает деньги и получает 200, продукт
 * отвечает `duplicate: true` и не меняет ничего, тревоги нет. Наружу — исправно работающий биллинг,
 * в котором одна услуга оплачена дважды. Закрыть ссылку у провайдера нам нечем: в
 * `PaymentProviderPort` такой операции нет, поэтому порядок «сначала переезд, потом оплата»
 * физически возможен и должен быть обработан, а не запрещён.
 */
describe('оплата по счёту, чей долг уже переехал', () => {
  it('снимает переехавший долг с преемника и засчитывает место (оплата ПОСЛЕ переезда)', async () => {
    const world = scenario();
    await withPaidPeriod(world);
    const unpaidSeat = await world.buySeat('seat-unpaid');

    world.setNow(PERIOD_ENDS_AT);
    const nextPeriod = await world.service.createOwnTariffRenewalInvoice(ORGANIZATION_ID);
    expect(nextPeriod.amountMinor).toBe(TARIFF.priceMinor + unpaidSeat.amountMinor);

    // Через час клиника всё-таки платит по старой ссылке.
    await world.pay(unpaidSeat.id, 'event-late-seat');

    const rows = await world.invoices();
    const paidSeatRow = rows.find((row) => row.id === unpaidSeat.id);
    const successor = rows.find((row) => row.id === nextPeriod.id);

    // Деньги не выброшены: счёт оплачен, место открыто.
    expect(paidSeatRow?.status).toBe('paid');
    expect(paidSeatRow?.supersededByInvoiceId).toBeNull();
    expect((await world.subscription()).paidAdditionalSeats).toBe(1);

    // И не списаны дважды: из счёта-преемника ушла ровно эта сумма — и из долга, и из суммы к оплате.
    expect(successor?.carriedDebtMinor).toBe(0);
    expect(successor?.amountMinor).toBe(TARIFF.priceMinor);

    // Сведение: за место заплачено ровно один раз.
    const payable = rows
      .filter((row) => row.status !== 'void' && row.id !== nextPeriod.id)
      .filter((row) => row.invoiceKind === 'seat_overage')
      .reduce((total, row) => total + row.amountMinor, 0);
    expect(payable).toBe(unpaidSeat.amountMinor);
  });

  it('оплата ДО переезда: долг не считается долгом, следующий счёт идёт по цене тарифа', async () => {
    const world = scenario();
    await withPaidPeriod(world);
    const seat = await world.buySeat('seat-unpaid');
    await world.pay(seat.id, 'event-seat-in-time');

    world.setNow(PERIOD_ENDS_AT);
    const nextPeriod = await world.service.createOwnTariffRenewalInvoice(ORGANIZATION_ID);

    expect(nextPeriod.carriedDebtMinor).toBe(0);
    // Цена следующего периода — тариф: оплаченное место открыло счётчик, но в новом периоде
    // оплачиваются места по ЖИВОМУ составу команды, а он в этом сценарии пуст.
    expect(nextPeriod.amountMinor).toBe(TARIFF.priceMinor);
    expect((await world.invoices()).find((row) => row.id === seat.id)?.status).toBe('paid');
  });

  it('преемник уже оплачен — деньги не выбрасываются молча и место не выдаётся дважды', async () => {
    const world = scenario();
    await withPaidPeriod(world);
    const unpaidSeat = await world.buySeat('seat-unpaid');

    world.setNow(PERIOD_ENDS_AT);
    const nextPeriod = await world.service.createOwnTariffRenewalInvoice(ORGANIZATION_ID);
    await world.pay(nextPeriod.id, 'event-next-period');

    await world.pay(unpaidSeat.id, 'event-late-seat');

    const rows = await world.invoices();
    // Сумма оплаченного счёта задним числом не правится: он уже оплачен именно на эту сумму.
    expect(rows.find((row) => row.id === nextPeriod.id)?.amountMinor).toBe(
      TARIFF.priceMinor + unpaidSeat.amountMinor,
    );
    // Счёт остаётся погашенным преемником: услуга оплачена дважды, и это возврат, а не арифметика.
    const late = rows.find((row) => row.id === unpaidSeat.id);
    expect(late?.status).toBe('void');
    expect(late?.supersededByInvoiceId).toBe(nextPeriod.id);
  });
});
