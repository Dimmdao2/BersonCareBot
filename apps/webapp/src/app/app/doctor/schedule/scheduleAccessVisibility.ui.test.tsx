import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DoctorScheduleShell } from './DoctorScheduleShell';
import { ScheduleSetupTab } from './tabs/ScheduleSetupTab';

const fakes = vi.hoisted(() => ({
  apiJson: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
  default: () =>
    function DynamicScheduleTabMock() {
      return <div data-testid="dynamic-schedule-tab" />;
    },
}));

vi.mock('@/shared/lib/apiJson', () => ({
  apiJson: fakes.apiJson,
}));

vi.mock('@/shared/ui/doctor/DoctorAppShell', () => ({
  DoctorAppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/shared/ui/doctor/shell/DoctorPageHeader', () => ({
  DoctorPageHeader: ({ tabs }: { tabs: React.ReactNode }) => <header>{tabs}</header>,
}));

const scheduleScopeBootstrap = {
  ownSpecialistId: '10000000-0000-4000-8000-000000000001',
  canManageAllSpecialists: false,
  specialists: [],
};

function shellProps() {
  return {
    paymentsVisible: true,
    paymentsReadOnly: false,
    notificationTemplatesVisible: true,
    packagesVisible: true,
    packagesReadOnly: false,
    scheduleScopeBootstrap,
    doctorStatisticsEnabled: true,
  };
}

function setupProps() {
  return {
    onDeepLinkChange: vi.fn(),
    doctorStatisticsEnabled: true,
  };
}

describe('doctor schedule access visibility', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    fakes.apiJson.mockReset();
    fakes.apiJson.mockImplementation(async (url: string) => {
      if (url === '/api/doctor/settings') return { ok: true, settings: [] };
      if (url.startsWith('/api/doctor/booking-engine/calendar')) {
        return { ok: true, filters: { branches: [], services: [], specialists: [] } };
      }
      if (url === '/api/doctor/booking-engine/packages') {
        return {
          ok: true,
          packages: [
            {
              id: '20000000-0000-4000-8000-000000000001',
              title: 'Пять визитов',
              priceMinor: 500000,
              validityDays: 30,
              deductionMode: 'manual',
              isActive: true,
              items: [],
            },
          ],
        };
      }
      if (url === '/api/doctor/booking-engine/services') return { ok: true, services: [] };
      throw new Error(`unexpected API call: ${url}`);
    });
  });

  it('keeps a regular specialist out of the management setup even through a direct URL', () => {
    render(
      <DoctorScheduleShell {...shellProps()} initialTab="setup" canManageOrganization={false} />,
    );

    expect(screen.queryByRole('button', { name: 'Настройки' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Записи' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('dynamic-schedule-tab')).toBeInTheDocument();
  });

  it('does not mount tariff-disabled notification or package sections from a direct link', async () => {
    render(
      <ScheduleSetupTab
        {...setupProps()}
        deepLinkParams={{ section: 'packages' }}
        paymentsVisible
        notificationTemplatesVisible={false}
        packagesVisible={false}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Тексты уведомлений' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Абонементы' })).not.toBeInTheDocument();
    expect(screen.getByTestId('setup-section-calendar')).toBeInTheDocument();

    await waitFor(() => expect(fakes.apiJson).toHaveBeenCalled());
    expect(fakes.apiJson.mock.calls.map(([url]) => url)).not.toContain(
      '/api/doctor/booking-engine/packages',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps entitled read-only packages visible without mutation controls', async () => {
    render(
      <ScheduleSetupTab
        {...setupProps()}
        deepLinkParams={{ section: 'packages' }}
        paymentsVisible
        notificationTemplatesVisible
        packagesVisible
        packagesReadOnly
      />,
    );

    await screen.findByText('Пять визитов');
    expect(screen.getByRole('button', { name: 'Абонементы' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Деактивировать' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Создать шаблон' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Календарь' }));
    expect(screen.getByTestId('setup-section-calendar')).toBeInTheDocument();
  });
});
