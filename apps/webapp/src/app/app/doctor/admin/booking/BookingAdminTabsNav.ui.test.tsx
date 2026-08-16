import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BookingAdminTabsNav } from './BookingAdminTabsNav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/admin/booking',
}));

describe('global-admin booking navigation', () => {
  it('offers only the platform overview and no removed tenant settings', () => {
    render(<BookingAdminTabsNav />);

    expect(screen.getByRole('link', { name: 'Обзор и настройка' })).toHaveAttribute(
      'href',
      '/app/admin/booking',
    );
    expect(screen.queryByRole('link', { name: 'Форма и публичная запись' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Оплата' })).not.toBeInTheDocument();
  });
});
