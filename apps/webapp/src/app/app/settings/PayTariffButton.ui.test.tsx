import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PayTariffButton } from './PayTariffButton';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PayTariffButton', () => {
  // L-11 (владелец 18.08): клиника без тарифа должна увидеть путь к выбору и оплате. Поломка:
  // при непустом списке и пустом выборе триггер остаётся пустой полосой, а «Перейти на тариф»
  // отключена — клиника, запертая без доступа, не понимает, что выбрать дальше.
  it('показывает выбор тарифа до первого выбора', () => {
    render(
      <PayTariffButton
        billingEmail={null}
        tariffChange={{
          choices: [{ id: 'tariff-1', name: 'Базовый' }],
          currentTariffId: null,
          pendingTariffId: null,
          pendingEffectiveAt: null,
          awaitingFirstPayment: false,
          payable: true,
        }}
      />,
    );

    const tariffSelector = screen.getByRole('combobox');
    expect(tariffSelector).toHaveTextContent('Выберите тариф');
    expect(screen.getByRole('button', { name: 'Перейти на тариф' })).toBeDisabled();

    fireEvent.click(tariffSelector);
    fireEvent.click(screen.getByRole('option', { name: 'Базовый' }));
    expect(screen.getByRole('button', { name: 'Перейти на тариф' })).not.toBeDisabled();
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
          choices: [{ id: 'tariff-1', name: 'Базовый' }],
          currentTariffId: 'tariff-1',
          pendingTariffId: null,
          pendingEffectiveAt: null,
          awaitingFirstPayment: false,
          payable: true,
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Оплатить тариф' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Email для чека'), {
      target: { value: 'PAYER@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

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
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Оплатить тариф' })).not.toBeDisabled(),
    );
  });

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
    render(
      <PayTariffButton
        billingEmail="clinic@example.test"
        tariffChange={{
          choices: [{ id: 'tariff-1', name: 'Базовый' }],
          currentTariffId: 'tariff-1',
          pendingTariffId: null,
          pendingEffectiveAt: null,
          awaitingFirstPayment: false,
          payable: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Оплатить тариф' }));

    await waitFor(() =>
      expect(
        screen.getByText('Оплата тарифа временно недоступна: платёжный магазин платформы не настроен.'),
      ).toBeInTheDocument(),
    );
  });

  // Решение владельца 18.08.2026: «Считать бесплатный тариф неоплачиваемым». Поломка, которую
  // ловит тест: экран предлагает оплатить тариф ценой 0 ₽, клик уходит на сервер и возвращается
  // отказом, который владелец клиники ничем исправить не может.
  it('на бесплатном тарифе объясняет, что платить нечего, и не предлагает оплату', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(
      <PayTariffButton
        billingEmail="clinic@example.test"
        tariffChange={{
          choices: [{ id: 'tariff-free', name: 'Бесплатный' }],
          currentTariffId: 'tariff-free',
          pendingTariffId: null,
          pendingEffectiveAt: null,
          awaitingFirstPayment: false,
          payable: false,
        }}
      />,
    );

    expect(screen.getByText('Тариф бесплатный — платить нечего.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Оплатить тариф' })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
