// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BookingPaymentsSection } from './BookingPaymentsSection';

vi.mock('./patchAdminSetting', () => ({ patchAdminSetting: vi.fn() }));

describe('BookingPaymentsSection tariff access', () => {
  it('keeps payment settings visible but disables their mutation controls in read-only access', () => {
    render(
      <BookingPaymentsSection
        paymentEnabled
        readOnly
        providersJson={{
          defaultProviderId: 'yookassa',
          providers: [{ id: 'yookassa', label: 'ЮKassa', enabled: true, shopId: 'shop-1' }],
        }}
      />,
    );

    expect(screen.getByText(/доступны только для просмотра по текущему тарифу/)).toBeVisible();
    const [paymentEnabledSwitch, providerEnabledSwitch] = screen.getAllByRole('switch');
    expect(paymentEnabledSwitch).toHaveAttribute('aria-checked', 'true');
    expect(paymentEnabledSwitch).toHaveAttribute('aria-disabled', 'true');
    expect(providerEnabledSwitch).toHaveAttribute('aria-checked', 'true');
    expect(providerEnabledSwitch).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(paymentEnabledSwitch);
    fireEvent.click(providerEnabledSwitch);
    expect(paymentEnabledSwitch).toHaveAttribute('aria-checked', 'true');
    expect(providerEnabledSwitch).toHaveAttribute('aria-checked', 'true');
    for (const combobox of screen.getAllByRole('combobox')) fireEvent.click(combobox);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });
});
