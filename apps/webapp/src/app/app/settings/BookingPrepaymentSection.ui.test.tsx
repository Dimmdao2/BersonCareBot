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

describe('B1.3 prepayment settings', () => {
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
});
