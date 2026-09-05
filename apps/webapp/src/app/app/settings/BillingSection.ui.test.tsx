import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillingSection } from './BillingSection';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const emptyBilling = {
  organizationId: 'org',
  billingEmail: null,
  subscriptions: [],
  invoices: [],
  providerEvents: [],
};

describe('BillingSection — деньги клиники уходят на сервер парой (тариф, период)', () => {
  it('sends PATCH to schedule the selected downgrade and DELETE to cancel it', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetch);
    render(
      <BillingSection
        tariffName="Стандарт"
        commercialStateLabel="Тариф активен."
        mechanics={[]}
        quotaUsage={[]}
        billing={emptyBilling}
        tariffChange={{
          choices: [
            {
              id: 'current',
              name: 'Стандарт',
              periodPrices: [{ billingPeriodCode: 'monthly', priceMinor: 500000 }],
            },
            {
              id: 'small',
              name: 'Базовый',
              periodPrices: [{ billingPeriodCode: 'monthly', priceMinor: 200000 }],
            },
          ],
          currentTariffId: 'current',
          pendingTariffId: 'small',
          pendingEffectiveAt: '2026-09-01T00:00:00.000Z',
          // #1069 owner decision 2026-09-05 (period grid) — the pending change also carries the
          // period it was scheduled for; the request must send both, never the tariff alone.
          currentBillingPeriodCode: 'monthly',
          pendingBillingPeriodCode: 'monthly',
          awaitingFirstPayment: false,
          payable: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Перейти на тариф' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/clinic/billing', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ tariffId: 'small', billingPeriodCode: 'monthly' }),
    })));

    // Отмена — второе действие пользователя. Клик повторяется внутри `waitFor`, пока не доедет до
    // сервера: единственное утверждение здесь — сам запрос, а не форма кнопки в промежуточный момент.
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
      expect(fetch).toHaveBeenCalledWith('/api/clinic/billing', { method: 'DELETE' });
    });
  });

  /**
   * L-11 (владелец 18.08): «она выбирает платный тариф — ИДЕТ ОПЛАЧИВАТЬ И ПОТОМ ПОЛУЧАЕТ ДОСТУП».
   * Названная поломка: клиника выбрала тариф, доступа ещё нет — и с этого экрана НЕЛЬЗЯ запустить
   * оплату (путь ведёт в админку платформы, куда владелец клиники не ходит). Отказ дорогой
   * (клиника заперта и не может купить доступ) и молчаливый (экран выглядит исправным).
   *
   * Оракул — наблюдаемый side effect действия пользователя: клик по оплате обязан уйти на
   * `POST /api/clinic/billing`, откуда сервер выдаёт ссылку на checkout. Ни текст экрана, ни
   * наличие/состояние контролов здесь не утверждаются: находим кнопку так, как её находит человек,
   * и проверяем, что она действительно запускает покупку.
   */
  it('выбранный, но не оплаченный тариф: клиника запускает оплату с этого же экрана', async () => {
    const fetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, checkoutUrl: 'https://pay.example/first' }),
    });
    vi.stubGlobal('fetch', fetch);
    render(
      <BillingSection
        // Снимок прав пуст — действующего тарифа нет, доступа нет.
        tariffName={null}
        commercialStateLabel="Тариф не назначен — доступа нет. Выберите тариф в админке, чтобы вернуть работу кабинета."
        mechanics={[]}
        quotaUsage={[]}
        billing={{ ...emptyBilling, billingEmail: 'clinic@example.test' }}
        tariffChange={{
          choices: [
            {
              id: 'chosen',
              name: 'Базовый',
              periodPrices: [{ billingPeriodCode: 'monthly', priceMinor: 100000 }],
            },
            {
              id: 'other',
              name: 'Стандарт',
              periodPrices: [{ billingPeriodCode: 'monthly', priceMinor: 300000 }],
            },
          ],
          currentTariffId: 'chosen',
          pendingTariffId: null,
          pendingEffectiveAt: null,
          currentBillingPeriodCode: 'monthly',
          pendingBillingPeriodCode: null,
          awaitingFirstPayment: true,
          payable: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Оплатить тариф' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/clinic/billing', { method: 'POST' }),
    );
  });
});
