import { describe, expect, it, vi } from 'vitest';
import { decideClinicTeamQuota } from '@/infra/repos/transactionQuotaPort';
import { createSaasBillingService } from './service';
import type { SaasBillingRepositoryPort } from './ports';
import type { SeatOverageQuote } from './seatOverageQuote';

/**
 * Аудит 19.08 денежной волны 18–19.08 (`6f4fb5cf8` — «доплата за место считается по остатку
 * периода»).
 *
 * Oracle — решение владельца 18.08, процитированное в самом `proration.ts`: «она оплачивает счёт
 * (с расчётом сколько сотрудников и сколько ДНЕЙ надо оплатить до конца оплаченного периода
 * текущего тарифа)» и «Доп счёт только один раз, и только до конца основного оплаченного периода».
 *
 * Разрыв: у оплаченного периода, который УЖЕ КОНЧИЛСЯ, дней до конца ноль, а место продаётся за
 * полную цену тарифа в окно услуги, которое кончается раньше, чем начинается. Состояние «период
 * кончился, продление ещё не оплачено» — не экзотика: конец периода двигает только оплата
 * (`promotePaidInvoice` ставит `currentPeriodEndsAt = invoice.servicePeriodEndsAt`), поэтому в нём
 * оказывается любая клиника, заплатившая за продление хоть на час позже срока. Механику мест
 * lifecycle при этом не закрывает вообще: «Seats (`места`) has no "exceeded seats" state at all»
 * (`modules/org-entitlements/service.ts`), а денежная дверь пускает даже заблокированный кабинет
 * (`allowCabinetRecovery: true` в `api/clinic/billing/route.ts`).
 *
 * Соседняя дверь того же сервиса на тот же вопрос отвечает обратным образом: когда оплаченного
 * периода НЕТ вовсе, `purchaseSeatOverage` отказывает (`seat_overage_unavailable`) — «продавать
 * место не во что». Кончившийся период — тот же самый случай, но вместо отказа выставляется
 * полный счёт.
 *
 * Чем чинить — отказом, как у соседней двери, или нулевой доплатой — решает владелец: его
 * собственный тест `proration.test.ts` («never hands out a free seat when there is no remaining
 * paid window») закрепляет полную цену намеренно. Здесь закреплено только то, что не может быть
 * верным ни при одном из этих решений: счёт с закрытым окном услуги.
 */
const SEAT_PRICE_MINOR = 150_000;
const LAPSED = {
  currentPeriodStartsAt: '2026-07-19T00:00:00.000Z',
  currentPeriodEndsAt: '2026-08-18T00:00:00.000Z',
} as const;
/** Продление опоздало на сутки — клиника ещё работает, оплаченный период уже кончился. */
const NOW = new Date('2026-08-19T09:41:00.000Z');

function quote(priceMinor: number): SeatOverageQuote {
  return {
    organizationId: 'org-1',
    purchaseKey: 'lapsed-period-purchase',
    priceMinor,
    currency: 'RUB',
    expiresAt: '2999-01-01T00:00:00.000Z',
  };
}

describe('место, проданное в уже кончившийся оплаченный период', () => {
  /**
   * Пробивается: цена места перестаёт зависеть от остатка периода ровно там, где остатка нет, —
   * клиника платит месяц тарифа за ноль дней.
   */
  it('не может стоить полный тариф места за ноль оставшихся дней', () => {
    const decision = decideClinicTeamQuota({
      includedSeats: 1,
      paidAdditionalSeats: 0,
      used: 1,
      additionalSeatPriceMinor: SEAT_PRICE_MINOR,
      currency: 'RUB',
      ...LAPSED,
      asOf: NOW.toISOString(),
    });

    expect(decision).toMatchObject({ code: 'seat_overage_confirmation_required' });
    expect(decision).not.toMatchObject({ priceMinor: SEAT_PRICE_MINOR });
  });

  /**
   * Пробивается: счёт за место выставляется на окно услуги, которое уже закрыто, — клиника платит
   * за услугу, оказать которую нельзя.
   */
  it('не выставляется счётом, окно услуги которого кончается раньше, чем начинается', async () => {
    const createSeatOverageInvoiceIfNeeded = vi.fn(async () => ({
      outcome: 'seat_overage_unavailable' as const,
    }));
    const service = createSaasBillingService({
      repository: {
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription-1',
          tariffId: 'tariff-1',
          billingPeriod: 'month' as const,
          ...LAPSED,
          savedPaymentMethodId: null,
          additionalSeatPriceMinor: SEAT_PRICE_MINOR,
          currency: 'RUB',
        }),
        createSeatOverageInvoiceIfNeeded,
      } as unknown as SaasBillingRepositoryPort,
      settings: { getSaasBillingPaymentProviderValue: async () => null },
      resolvePaymentProvider: () => ({ createIntent: async () => ({}) }) as never,
      now: () => NOW,
    });

    await service.purchaseSeatOverage({
      organizationId: 'org-1',
      quote: quote(SEAT_PRICE_MINOR),
    });

    const raised = (
      createSeatOverageInvoiceIfNeeded.mock.calls as unknown as Array<
        [{ servicePeriodStartsAt: string; servicePeriodEndsAt: string }]
      >
    )[0]?.[0];
    if (raised) {
      expect(
        Date.parse(raised.servicePeriodEndsAt) > Date.parse(raised.servicePeriodStartsAt),
      ).toBe(true);
    }
  });
});
