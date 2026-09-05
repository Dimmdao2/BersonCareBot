import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toastMock }));

import { PayTariffButton } from './PayTariffButton';

beforeEach(() => {
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Тариф с двумя оценёнными периодами и тариф, у которого оценён только месяц. */
const TWO_TARIFFS = [
  {
    id: 'tariff-a',
    name: 'Тариф А',
    periodPrices: [
      { billingPeriodCode: 'month', priceMinor: 100000 },
      { billingPeriodCode: 'year', priceMinor: 1000000 },
    ],
  },
  { id: 'tariff-b', name: 'Тариф Б', periodPrices: [{ billingPeriodCode: 'month', priceMinor: 50000 }] },
];

describe('PayTariffButton', () => {
  /**
   * #1069 (владелец 05.09): клиент выбирает ПАРУ «тариф + период», и на сервер уходит только она —
   * сумму называет сервер. Названная поломка: экран отправляет период, который выбранный тариф не
   * оценивает (остался от предыдущего тарифа) или не отправляет период вовсе. Первое = покупка
   * пары без цены, второе = запрос, который маршрут отвергает целиком, — клиника не может ни
   * сменить тариф, ни купить доступ. Отказ дорогой (деньги/доступ) и молчаливый (экран показал
   * ровно то, что человек выбрал).
   *
   * Оракул — тело PATCH-запроса, а не вид селектов: единственное, что видит сервер.
   */
  it('отправляет ту пару, которую человек выбрал, и не тащит период чужого тарифа', async () => {
    const fetch = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetch);
    render(
      <PayTariffButton
        billingEmail={null}
        tariffChange={{
          choices: TWO_TARIFFS,
          // Клиника сейчас на годовом периоде тарифа А.
          currentTariffId: 'tariff-a',
          pendingTariffId: null,
          pendingEffectiveAt: null,
          currentBillingPeriodCode: 'year',
          pendingBillingPeriodCode: null,
          awaitingFirstPayment: false,
          payable: true,
        }}
      />,
    );

    // Один-единственный выбор человека: тариф Б, у которого ГОДА в матрице цен НЕТ. Два
    // одноролевых select'а (тариф + период, #1069) различаем по accessible name, а не по
    // позиции/счёту — владелец прямо запретил такие UI-shape запросы для этого компонента.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(screen.getByRole('combobox', { name: 'Тариф' }));
    await user.click(screen.getByRole('option', { name: 'Тариф Б' }));
    await user.click(screen.getByRole('button', { name: 'Перейти на тариф' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/clinic/billing',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ tariffId: 'tariff-b', billingPeriodCode: 'month' }),
        }),
      ),
    );
  });

  it('saves the receipt email before enabling checkout', async () => {
    const fetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, billingEmail: 'payer@example.test' }),
    });
    vi.stubGlobal('fetch', fetch);
    render(
      <PayTariffButton
        billingEmail={null}
        tariffChange={{
          choices: [
            {
              id: 'tariff-1',
              name: 'Базовый',
              periodPrices: [{ billingPeriodCode: 'monthly', priceMinor: 100000 }],
            },
          ],
          currentTariffId: 'tariff-1',
          pendingTariffId: null,
          pendingEffectiveAt: null,
          currentBillingPeriodCode: 'monthly',
          pendingBillingPeriodCode: null,
          awaitingFirstPayment: false,
          payable: true,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Email для чека'), {
      target: { value: 'PAYER@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    // Чек уходит на тот адрес, который человек ввёл, отдельным именованным действием: сервер
    // фискализирует платёж по сохранённому email, а не по тому, что лежит в поле ввода.
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/clinic/billing',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            action: 'billing_contact',
            billingEmail: 'PAYER@example.test',
          }),
        }),
      ),
    );
  });

  /**
   * Названная поломка: сервер отказал (`ok: false`), но в теле ответа лежит `checkoutUrl` — и экран
   * всё равно уводит браузер по этому адресу. Клиника уходит платить по ссылке, которую сервер
   * платёжной не признал. Отказ дорогой (деньги мимо кассы) и молчаливый (человек видит обычную
   * страницу оплаты).
   *
   * Оракул — сам факт навигации, а не текст сообщения: адрес окна обязан остаться прежним.
   */
  it('does not start checkout when the unavailable-provider response contains a URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: false,
          error: 'saas_billing_payment_provider_unavailable',
          checkoutUrl: 'https://pay.example/should-not-open',
        }),
      }),
    );
    // Тот же приём, что в `AuthFlowV2.oauthProviders.ui.test.tsx`: `window.location` подменяется
    // объектом, на котором присваивание `href` наблюдаемо, вместо необучаемого jsdom-навигатора.
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: 'http://test/app/settings' },
      writable: true,
      configurable: true,
    });
    render(
      <PayTariffButton
        billingEmail="clinic@example.test"
        tariffChange={{
          choices: [
            {
              id: 'tariff-1',
              name: 'Базовый',
              periodPrices: [{ billingPeriodCode: 'monthly', priceMinor: 100000 }],
            },
          ],
          currentTariffId: 'tariff-1',
          pendingTariffId: null,
          pendingEffectiveAt: null,
          currentBillingPeriodCode: 'monthly',
          pendingBillingPeriodCode: null,
          awaitingFirstPayment: false,
          payable: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Оплатить тариф' }));

    // Отказ обязан быть показан (молча ронять оплату нельзя), но КУДА-ТО ВЕСТИ по этой ссылке —
    // нельзя: проверяем именно адрес окна, не формулировку сообщения.
    await waitFor(() => {
      expect(window.location.href).toBe('http://test/app/settings');
      expect(toastMock.error).toHaveBeenCalled();
    });
  });
});
