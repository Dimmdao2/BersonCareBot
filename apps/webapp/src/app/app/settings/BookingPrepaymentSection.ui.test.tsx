import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({ apiJson: vi.fn() }));

vi.mock('@/shared/lib/apiJson', () => ({ apiJson: fakes.apiJson }));

import { BookingPrepaymentSection } from './BookingPrepaymentSection';

const unavailableAvailability = {
  available: false,
  reason: 'payment_provider_unavailable' as const,
};

function policyResponse(mode: 'disabled' | 'fixed_minor') {
  return {
    ok: true,
    policies: [
      {
        serviceId: 'service-1',
        onlineCategory: null,
        mode,
        amountMinor: mode === 'fixed_minor' ? 1_000 : null,
        percentBps: null,
      },
    ],
    availability: unavailableAvailability,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.apiJson.mockImplementation((url: string) => {
    if (url.includes('/services'))
      return Promise.resolve({ ok: true, services: [{ id: 'service-1', title: 'Приём' }] });
    return Promise.resolve(policyResponse('fixed_minor'));
  });
});

afterEach(cleanup);

async function chooseService() {
  const user = userEvent.setup();
  const [, serviceSelect] = screen.getAllByRole('combobox');
  await user.click(serviceSelect);
  await user.click(await screen.findByRole('option', { name: 'Приём' }));
}

/** Money the clinic actually sends to the API for this policy. */
function sentAmountMinor() {
  const call = fakes.apiJson.mock.calls.find(
    (args) => (args[1] as RequestInit | undefined)?.method === 'PUT',
  );
  if (!call) throw new Error('no policy was sent');
  return JSON.parse(String((call[1] as RequestInit).body)).amountMinor;
}

describe('B1.3 prepayment settings', () => {
  it('does not render the prepayment settings when the mechanic is off', async () => {
    fakes.apiJson.mockImplementation((url: string) => {
      if (url.includes('/services')) return Promise.resolve({ ok: true, services: [] });
      return Promise.resolve({
        ok: true,
        policies: [],
        availability: { available: false, reason: 'entitlement_required' },
        visible: false,
      });
    });

    render(<BookingPrepaymentSection />);

    await waitFor(() => {
      expect(screen.queryByText('Предоплата')).not.toBeInTheDocument();
    });
  });

  it('shows the provider reason and blocks saving an already active policy', async () => {
    render(<BookingPrepaymentSection />);

    await screen.findByText('Настройте активного платёжного провайдера в кабинете клиники.');
    await chooseService();

    expect(screen.getByDisplayValue('1000')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('keeps saving a disabled policy available while the provider is unavailable', async () => {
    fakes.apiJson.mockImplementation((url: string) => {
      if (url.includes('/services'))
        return Promise.resolve({ ok: true, services: [{ id: 'service-1', title: 'Приём' }] });
      return Promise.resolve(policyResponse('disabled'));
    });

    render(<BookingPrepaymentSection />);
    await screen.findByText('Настройте активного платёжного провайдера в кабинете клиники.');
    await chooseService();

    const user = userEvent.setup();
    const modeSelect = screen.getAllByRole('combobox')[2];
    await user.click(modeSelect);
    await user.click(await screen.findByRole('option', { name: 'Фикс (коп.)' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
    });
  });

  it('lets the clinic disable a previously active policy while the provider is unavailable', async () => {
    render(<BookingPrepaymentSection />);
    await screen.findByText('Настройте активного платёжного провайдера в кабинете клиники.');
    await chooseService();

    const user = userEvent.setup();
    const modeSelect = screen.getAllByRole('combobox')[2];
    await user.click(modeSelect);
    await user.click(await screen.findByRole('option', { name: 'Отключена' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
    });
  });

  it.each([
    'commercial_read_only',
    'commercial_blocked',
    'access_lifecycle_unconfigured',
  ] as const)('keeps policy controls read-only for tariff reason %s', async (reason) => {
    fakes.apiJson.mockImplementation((url: string) => {
      if (url.includes('/services'))
        return Promise.resolve({ ok: true, services: [{ id: 'service-1', title: 'Приём' }] });
      return Promise.resolve({
        ...policyResponse('fixed_minor'),
        availability: { available: false, reason },
      });
    });

    render(<BookingPrepaymentSection />);
    await screen.findByText('Предоплата');
    await chooseService();

    expect(screen.getAllByRole('combobox')[2]).toBeDisabled();
    expect(screen.getByDisplayValue('1000')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  // Отказ: сумма предоплаты уезжает между рублями человека и копейками хранилища — списание
  // в 100 раз мимо, молча и без единой ошибки.
  it('keeps the fixed prepayment amount in rubles for the person and in minor units for the API', async () => {
    fakes.apiJson.mockImplementation((url: string) => {
      if (url.includes('/services'))
        return Promise.resolve({ ok: true, services: [{ id: 'service-1', title: 'Приём' }] });
      return Promise.resolve({
        ok: true,
        policies: [
          {
            serviceId: 'service-1',
            onlineCategory: null,
            mode: 'fixed_minor' as const,
            amountMinor: 50_000,
            percentBps: null,
          },
        ],
        availability: { available: true },
      });
    });

    render(<BookingPrepaymentSection />);
    await screen.findAllByRole('combobox');
    await chooseService();

    // 50 000 копеек хранилища человек видит как 500 ₽.
    const amount = await screen.findByDisplayValue('500');

    const user = userEvent.setup();
    await user.clear(amount);
    await user.type(amount, '500,50');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(sentAmountMinor()).toBe(50_050);
    });
  });
});
