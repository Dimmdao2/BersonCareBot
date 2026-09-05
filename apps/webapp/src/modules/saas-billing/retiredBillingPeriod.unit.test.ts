import { describe, expect, it, vi } from 'vitest';
import { createSaasBillingService } from './service';
import type { SaasBillingRepositoryPort } from './ports';

/**
 * #1069 owner decision 2026-09-05 (Т14, `docs/OWNER_DECISIONS.md`), item 1: a billing period is
 * DATA carrying a «можно выбрать»/«снят» flag, and item 2: снятие периода — глобальное и НЕ
 * разрушает историю, то есть строки цены снятого периода ОСТАЮТСЯ в матрице.
 *
 * Названная поломка: клиника выбирает период, который владелец уже СНЯЛ с продажи, платит по его
 * цене, и продление продолжает выставлять счета за снятый период бесконечно. Отказ дорогой
 * (продаём отозванный владельцем период по замороженной цене) и молчаливый (ничего не падает —
 * покупка проходит как обычная).
 *
 * Oracle — решение владельца, не реализация: «период … (метка, число месяцев, порядок, признак
 * „можно выбрать“/„снят“)» и «снятие периода — глобальное и не разрушает историю». Из двух вместе
 * следует, что сохранившаяся строка цены снятого периода НЕ делает его снова покупаемым.
 *
 * Самый дешёвый публичный слой — `scheduleOwnTariffChange`: это единственная дверь, через которую
 * клиника называет пару (тариф, период), и именно она обязана свести код периода с глобальной
 * сеткой. Ни route-, ни UI-слой другого класса поломки здесь не ловят.
 */
describe('scheduleOwnTariffChange — снятый период не продаётся', () => {
  /** Глобальная сетка: «месяц» продаётся, «год» СНЯТ владельцем (`isSelectable: false`). */
  const BILLING_PERIODS = [
    { code: 'month', label: 'Месяц', months: 1, isSelectable: true, sortOrder: 10 },
    { code: 'year', label: 'Год', months: 12, isSelectable: false, sortOrder: 120 },
  ];

  /**
   * Матрица цен тарифа. Строка за «год» ЖИВА намеренно: снятие периода не разрушает историю, иначе
   * оплаченные подписки и счета потеряли бы ссылку на свою пару. Ровно это и делает дыру
   * достижимой.
   */
  const TARIFF_CHOICES = [
    {
      id: 'tariff-1',
      name: 'Стандарт',
      periodPrices: [
        { billingPeriodCode: 'month', priceMinor: 100_000 },
        { billingPeriodCode: 'year', priceMinor: 1_000_000 },
      ],
    },
  ];

  function buildService(setManualSaasBillingSubscription: ReturnType<typeof vi.fn>) {
    return createSaasBillingService({
      repository: {
        listBillingPeriods: async () => BILLING_PERIODS,
        listActiveTariffChoices: async () => TARIFF_CHOICES,
        requireOwnTariffBillingSubscription: async () => ({
          saasBillingSubscriptionId: 'subscription-1',
          currentTariffId: 'tariff-1',
          currentBillingPeriodCode: 'month',
          tariffId: 'tariff-1',
          billingPeriod: 'month',
          savedPaymentMethodId: null,
          currentPeriodStartsAt: '2026-09-01T00:00:00.000Z',
          currentPeriodEndsAt: '2026-10-01T00:00:00.000Z',
        }),
        runManualAssignmentTransaction: async (work: (transaction: unknown) => Promise<unknown>) =>
          work({
            loadManualAssignmentState: async () => ({
              organization: { id: 'org-1', tariffId: 'tariff-1' },
              activeTrial: null,
              manualSaasBillingSubscription: {
                status: 'active',
                tariffId: 'tariff-1',
                billingPeriodCode: 'month',
                pendingTariffId: null,
                pendingBillingPeriodCode: null,
                currentPeriodStartsAt: '2026-09-01T00:00:00.000Z',
                currentPeriodEndsAt: '2026-10-01T00:00:00.000Z',
              },
            }),
            requireActiveTariff: async () => ({ billingPeriod: 'month' }),
            setManualSaasBillingSubscription,
            appendManualAssignmentAudit: async () => {},
            updateOrganizationTariffAssignment: async () => ({ tariffId: 'tariff-1' }),
          }),
      } as unknown as SaasBillingRepositoryPort,
      settings: {
        getSaasBillingPaymentProviderValue: async () => ({
          defaultProviderId: 'mock',
          providers: [{ id: 'mock', label: 'Mock', enabled: true }],
        }),
      },
      resolvePaymentProvider: () => {
        throw new Error('payment_provider_must_not_be_reached');
      },
      now: () => new Date('2026-09-05T00:00:00.000Z'),
      getTariffTransition: async () => ({
        currentTariffId: 'tariff-1',
        targetTariffId: 'tariff-1',
        blocks: [],
        appliesNextPeriod: true,
      }),
    });
  }

  it('отказывает в переходе на СНЯТЫЙ период, хотя его строка цены сохранилась', async () => {
    const setManualSaasBillingSubscription = vi.fn(
      async (_input: { pendingBillingPeriodCode?: string | null }) => {},
    );
    const service = buildService(setManualSaasBillingSubscription);

    // Отказ назван стабильным публичным кодом, а не любой ошибкой: маршрут отображает причины по
    // ТОЧНОМУ равенству кода (`ApiErrorLiteralRules`), поэтому «упало хоть как-то» не отличило бы
    // отказ по снятому периоду от падения на пустом каталоге или на несуществующем тарифе.
    await expect(
      service.scheduleOwnTariffChange({
        organizationId: 'org-1',
        tariffId: 'tariff-1',
        billingPeriodCode: 'year',
        actorId: 'user-1',
      }),
    ).rejects.toThrow('saas_billing_period_not_selectable');

    // Главное утверждение: снятый период не должен доехать до записи подписки НИ ПРИ КАКОМ исходе.
    // Проверяем сам наблюдаемый side effect, а не только тип отказа: планирование снятого периода —
    // это именно то, что потом оплатится и будет продлеваться.
    const scheduledPeriods = setManualSaasBillingSubscription.mock.calls.map(
      (call) => call[0].pendingBillingPeriodCode,
    );
    expect(scheduledPeriods).not.toContain('year');
  });

  it('пропускает выбираемый период того же тарифа (контроль: отказ не тотальный)', async () => {
    const setManualSaasBillingSubscription = vi.fn(async () => {});
    const service = buildService(setManualSaasBillingSubscription);

    // Тот же тариф, тот же ВЫБИРАЕМЫЙ период = «отмена запланированной смены», штатный путь.
    await expect(
      service.scheduleOwnTariffChange({
        organizationId: 'org-1',
        tariffId: 'tariff-1',
        billingPeriodCode: 'month',
        actorId: 'user-1',
      }),
    ).resolves.toEqual({ outcome: 'cancelled' });
  });
});
