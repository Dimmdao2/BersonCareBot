import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PayTariffButton } from './PayTariffButton';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PayTariffButton', () => {
  it('saves the receipt email before enabling checkout', async () => {
    const fetch = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, billingEmail: 'payer@example.test' }),
    });
    vi.stubGlobal('fetch', fetch);
    render(
      <PayTariffButton
        billingEmail={null}
        tariffChange={{
          choices: [],
          currentTariffId: null,
          pendingTariffId: null,
          pendingEffectiveAt: null,
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
          choices: [],
          currentTariffId: null,
          pendingTariffId: null,
          pendingEffectiveAt: null,
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
});
