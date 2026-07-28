/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const fetchSoloOverviewMock = vi.hoisted(() => vi.fn());

vi.mock('@/app/app/settings/bookingSoloAdminApi', async () => {
  const actual = await vi.importActual<typeof import('@/app/app/settings/bookingSoloAdminApi')>(
    '@/app/app/settings/bookingSoloAdminApi',
  );
  return { ...actual, fetchSoloOverview: fetchSoloOverviewMock };
});

import { BookingSoloAvailabilitySection } from './BookingSoloAvailabilitySection';

function overview(onlineActive: boolean) {
  return {
    organizationId: 'org-a',
    organization: { id: 'org-a', title: 'Клиника A' },
    branches: [
      {
        id: 'online-a',
        title: 'Онлайн',
        shortTitle: 'Онлайн',
        color: '#7c3aed',
        cityCode: 'online',
        address: null,
        timezone: 'Europe/Moscow',
        isActive: onlineActive,
        sortOrder: 10,
      },
    ],
    specialists: [{ id: 'specialist-a', fullName: 'Врач', isActive: true }],
    services: [
      {
        id: 'service-a',
        title: 'Консультация',
        description: null,
        durationMinutes: 60,
        bufferAfterMinutes: 0,
        priceMinor: 100000,
        publicWidgetVisible: true,
        adminManualOnly: false,
        usableInPackages: false,
        prepaymentApplicable: false,
        onlinePaymentApplicable: false,
        isActive: true,
        sortOrder: 0,
      },
    ],
    specialistAvailability: [],
    locationAvailability: [],
  };
}

describe('BookingSoloAvailabilitySection Online column', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not render the Online service column while the built-in location is off', async () => {
    fetchSoloOverviewMock.mockResolvedValue(overview(false));
    render(<BookingSoloAvailabilitySection />);
    expect(
      await screen.findByText('Сначала добавьте активные локации и услуги.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Онлайн' })).not.toBeInTheDocument();
  });

  it('renders Online with services defaulting to off when the location is on', async () => {
    fetchSoloOverviewMock.mockResolvedValue(overview(true));
    render(<BookingSoloAvailabilitySection />);
    expect(await screen.findByRole('columnheader', { name: 'Онлайн' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Консультация — Онлайн' })).not.toBeChecked();
  });
});
