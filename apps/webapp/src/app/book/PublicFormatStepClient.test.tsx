/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PublicFormatStepClient } from './PublicFormatStepClient';
import type { BookingCity } from '@/modules/booking-catalog/types';

function city(overrides: Partial<BookingCity> = {}): BookingCity {
  return {
    id: '550e8400-e29b-41d4-a716-446655440010',
    code: 'moscow',
    title: 'Москва',
    isActive: true,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('PublicFormatStepClient', () => {
  it('carries orgSlug into the service-step link on the canonical per-clinic entry /book/{slug}', () => {
    render(
      <PublicFormatStepClient
        cities={[city()]}
        onlineLocation={null}
        catalogError={null}
        orgSlug="saas-test-clinic-a"
      />,
    );
    const link = screen.getByRole('link', { name: /Москва/ });
    expect(link.getAttribute('href')).toContain(
      `orgSlug=${encodeURIComponent('saas-test-clinic-a')}`,
    );
  });

  it('omits orgSlug on the generic /book entry', () => {
    render(<PublicFormatStepClient cities={[city()]} onlineLocation={null} catalogError={null} />);
    const link = screen.getByRole('link', { name: /Москва/ });
    expect(link.getAttribute('href')).not.toContain('orgSlug=');
  });

  it('shows the configured Online entry only for the scoped organization and keeps its slug', () => {
    render(
      <PublicFormatStepClient
        cities={[]}
        onlineLocation={{ id: 'online-a', cityCode: 'online', title: 'Онлайн' }}
        catalogError={null}
        orgSlug="clinic-a"
      />,
    );
    const link = screen.getByRole('link', { name: 'Онлайн-приём' });
    expect(link.getAttribute('href')).toContain('cityCode=online');
    expect(link.getAttribute('href')).toContain('orgSlug=clinic-a');
    expect(screen.queryByRole('link', { name: 'Реабилитация онлайн' })).not.toBeInTheDocument();
  });

  it('renders the configured Online entry in the Online block, not the physical-locations block', () => {
    render(
      <PublicFormatStepClient
        cities={[city()]}
        onlineLocation={{ id: 'online-a', cityCode: 'online', title: 'Онлайн' }}
        catalogError={null}
        orgSlug="clinic-a"
      />,
    );

    const physicalBlock = screen.getByText('Очный приём').parentElement;
    const onlineBlock = screen.getByText('Онлайн').parentElement;
    expect(physicalBlock).not.toBeNull();
    expect(onlineBlock).not.toBeNull();
    expect(within(physicalBlock!).getByRole('link', { name: 'Москва' })).toBeInTheDocument();
    expect(
      within(physicalBlock!).queryByRole('link', { name: 'Онлайн-приём' }),
    ).not.toBeInTheDocument();
    expect(within(onlineBlock!).getByRole('link', { name: 'Онлайн-приём' })).toBeInTheDocument();
  });
});
