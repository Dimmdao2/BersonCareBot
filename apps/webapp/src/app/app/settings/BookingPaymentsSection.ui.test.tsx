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
    const paymentEnabledSwitch = screen.getAllByRole('switch')[0]!;
    expect(paymentEnabledSwitch).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(paymentEnabledSwitch);
    expect(paymentEnabledSwitch).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });
});
