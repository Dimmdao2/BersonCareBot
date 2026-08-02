import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PayTariffButton } from './PayTariffButton';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PayTariffButton', () => {
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
