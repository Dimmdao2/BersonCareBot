/**
 * Жизнь докупленного пакета объёма от покупки до отказа — на деньгах, а не на форме кода.
 *
 * Решения владельца 10.09.2026, дословно:
 *   «если человек хочет, он может просто докупить объём дополнительно… стоимость рассчитывается с
 *   момента покупки до конца периода подписки основного тарифа… Предоставляется пакет места
 *   [сразу], со следующего периода счёт выставляется»;
 *   «пока он места не освободит, этого не может произойти — отказ на отключение доппакета»;
 *   «отключение происходит… в конце оплаченного периода».
 *
 * Поломки, которые ловит этот файл, — все молчаливые и все на деньгах или на услуге:
 * 1. «Пакет купили — а счёт следующего периода выставлен по цене голого тарифа»: объём клиника
 *    получает, платит за него один раз, дальше бесплатно.
 * 2. «Отказ приняли, пока место занято»: со следующего периода потолок падает ниже занятого, и
 *    клиника оказывается за стеной, из которой нет выхода.
 * 3. «Отказ отобрал объём сейчас»: оплаченный период отобран задним числом (Р-18).
 * 4. «После отказа купили пакет — и он всё равно не продлился»: гашение отказа забыли, деньги
 *    взяли, услугу со следующего периода не дали.
 */
import { describe, expect, it, vi } from 'vitest';
import { createSaasBillingService } from './service';
import { createInMemorySaasBillingRepository } from '@/infra/repos/inMemorySaasBilling';
import type { PaymentProviderPort } from '@/modules/payments/providerPort';

const TARIFF = {
  id: 'tariff-storage',
  name: 'Стандарт',
  priceMinor: 500_000,
  currency: 'RUB',
  billingPeriod: 'month',
  additionalSeatPriceMinor: 150_000,
};

/** Каталог: 100 ГиБ за 90 000 и 200 ГиБ за 160 000 — цены за месяц, как у тарифа. */
const GIB = 1024 ** 3;
const SMALL_PACKAGE = {
  id: '11111111-1111-4111-8111-111111111111',
  bytes: 100 * GIB,
  currency: 'RUB',
  periodPrices: { month: 90_000 },
};
const BIG_PACKAGE = {
  id: '22222222-2222-4222-8222-222222222222',
  bytes: 200 * GIB,
  currency: 'RUB',
  periodPrices: { month: 160_000 },
};

const ORGANIZATION_ID = 'org-storage-lifecycle';
const PERIOD_STARTS_AT = '2026-07-01T00:00:00.000Z';
const PERIOD_ENDS_AT = '2026-08-01T00:00:00.000Z';
/** Потолок тарифа без пакета — 50 ГиБ. Двойник берёт занятое и потолок из фикстуры, не выдумывает. */
const TARIFF_ONLY_LIMIT = 50 * GIB;

function scenario(usedBytes: number) {
  let clock = new Date(PERIOD_STARTS_AT);
  const repository = createInMemorySaasBillingRepository({
    tariffs: [TARIFF],
    storagePackages: [SMALL_PACKAGE, BIG_PACKAGE],
    storageUsage: {
      [ORGANIZATION_ID]: { usedBytes, limitWithoutPackageBytes: TARIFF_ONLY_LIMIT },
    },
    now: () => clock,
  });
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
    /** Цену считает сервер; тест её не выдумывает, а спрашивает заведомо неверной котировкой. */
    async buyPackage(storagePackageId: string) {
      const quote = (priceMinor: number) => ({
        organizationId: ORGANIZATION_ID,
        storagePackageId,
        purchaseKey: `storage:${storagePackageId}`,
        priceMinor,
        currency: 'RUB',
        expiresAt: '2999-01-01T00:00:00.000Z',
      });
      const probe = await service.purchaseStoragePackage({
        organizationId: ORGANIZATION_ID,
        storagePackageId,
        quote: quote(1),
      });
      if (probe.outcome !== 'price_changed') {
        throw new Error(`test_seed_storage_price_probe_failed:${probe.outcome}`);
      }
      const result = await service.purchaseStoragePackage({
        organizationId: ORGANIZATION_ID,
        storagePackageId,
        quote: quote(probe.priceMinor),
      });
      if (result.outcome !== 'storage_opened') {
        throw new Error(`test_seed_storage_purchase_failed:${result.outcome}`);
      }
      return result.invoice;
    },
    async subscription() {
      const overview = await repository.getOrganizationBillingOverview(ORGANIZATION_ID);
      const row = overview.subscriptions.find((entry) => entry.source === 'paid_subscription');
      if (!row) throw new Error('test_seed_subscription_missing');
      return row;
    },
  };
}

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

describe('купленный пакет продолжает жить в следующем периоде', () => {
  it('входит строкой в счёт продления, а не остаётся разовой покупкой', async () => {
    const world = scenario(10 * GIB);
    await withPaidPeriod(world);
    const purchase = await world.buyPackage(SMALL_PACKAGE.id);
    await world.pay(purchase.id, 'event-storage-1');

    world.setNow(PERIOD_ENDS_AT);
    const nextPeriod = await world.service.createOwnTariffRenewalInvoice(ORGANIZATION_ID);

    expect(nextPeriod.storagePackageId).toBe(SMALL_PACKAGE.id);
    expect(nextPeriod.amountMinor).toBe(TARIFF.priceMinor + SMALL_PACKAGE.periodPrices.month);
  });

  it('за остаток периода берёт пропорцию, а не полную цену пакета', async () => {
    const world = scenario(10 * GIB);
    await withPaidPeriod(world);
    // Половина периода прошла — покупка стоит меньше полной цены пакета, но не ноль.
    world.setNow('2026-07-17T00:00:00.000Z');
    const purchase = await world.buyPackage(SMALL_PACKAGE.id);

    expect(purchase.amountMinor).toBeGreaterThan(0);
    expect(purchase.amountMinor).toBeLessThan(SMALL_PACKAGE.periodPrices.month);
    // Срок счёта — конец периода той услуги, которую он продаёт (Р-19).
    expect(purchase.expiresAt).toBe(PERIOD_ENDS_AT);
    expect(purchase.servicePeriodEndsAt).toBe(PERIOD_ENDS_AT);
  });
});

describe('отказ от пакета', () => {
  it('отклоняется, пока занято больше, чем останется без пакета, и называет число', async () => {
    // 120 ГиБ занято при потолке тарифа 50 ГиБ: без пакета это переполнение.
    const world = scenario(120 * GIB);
    await withPaidPeriod(world);
    await world.buyPackage(SMALL_PACKAGE.id);

    const result = await world.service.releaseStoragePackage({ organizationId: ORGANIZATION_ID });

    expect(result).toEqual({
      outcome: 'occupied',
      freeBytes: 120 * GIB - TARIFF_ONLY_LIMIT,
      limitWithoutPackage: TARIFF_ONLY_LIMIT,
    });
    // Отказ ничего не изменил: пакет действует и продлевается, как будто кнопку не нажимали.
    const subscription = await world.subscription();
    expect(subscription.paidStoragePackageId).toBe(SMALL_PACKAGE.id);
    expect(subscription.storagePackageCancelAtPeriodEnd).toBe(false);
  });

  it('принимается, когда место позволяет, но объём не отбирают до конца периода', async () => {
    const world = scenario(10 * GIB);
    await withPaidPeriod(world);
    const purchase = await world.buyPackage(SMALL_PACKAGE.id);
    await world.pay(purchase.id, 'event-storage-released');

    const result = await world.service.releaseStoragePackage({ organizationId: ORGANIZATION_ID });

    expect(result).toEqual({ outcome: 'released_at_period_end', effectiveAt: PERIOD_ENDS_AT });
    // Р-18: услуга оплачена до конца периода — сейчас объём остаётся.
    const subscription = await world.subscription();
    expect(subscription.paidStoragePackageId).toBe(SMALL_PACKAGE.id);
    expect(subscription.storagePackageCancelAtPeriodEnd).toBe(true);

    // А со следующего периода пакета в счёте нет — платит только тариф.
    world.setNow(PERIOD_ENDS_AT);
    const nextPeriod = await world.service.createOwnTariffRenewalInvoice(ORGANIZATION_ID);
    expect(nextPeriod.storagePackageId).toBeNull();
    expect(nextPeriod.amountMinor).toBe(TARIFF.priceMinor);
  });

  it('покупка после отказа возвращает продление: заплатили — значит продолжаем', async () => {
    const world = scenario(10 * GIB);
    await withPaidPeriod(world);
    const small = await world.buyPackage(SMALL_PACKAGE.id);
    await world.pay(small.id, 'event-storage-small');
    await world.service.releaseStoragePackage({ organizationId: ORGANIZATION_ID });

    // Передумали и взяли пакет побольше — это намерение продолжать, а не остаток прежнего отказа.
    const big = await world.buyPackage(BIG_PACKAGE.id);
    await world.pay(big.id, 'event-storage-big');

    world.setNow(PERIOD_ENDS_AT);
    const nextPeriod = await world.service.createOwnTariffRenewalInvoice(ORGANIZATION_ID);
    expect(nextPeriod.storagePackageId).toBe(BIG_PACKAGE.id);
    expect(nextPeriod.amountMinor).toBe(TARIFF.priceMinor + BIG_PACKAGE.periodPrices.month);
  });

  it('отказываться не от чего, когда пакет не куплен', async () => {
    const world = scenario(10 * GIB);
    await withPaidPeriod(world);

    const result = await world.service.releaseStoragePackage({ organizationId: ORGANIZATION_ID });

    expect(result).toEqual({ outcome: 'no_package' });
  });
});
