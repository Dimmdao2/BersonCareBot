/** @vitest-environment jsdom */

import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const guardMock = vi.hoisted(() => vi.fn());
const shellMock = vi.hoisted(() =>
  vi.fn(({ children }: { children: ReactNode }) => <main>{children}</main>),
);

vi.mock('@/app-layer/guards/requireRole', () => ({ requireStaffPersonalInstallPage: guardMock }));
vi.mock('@/shared/ui/doctor/shell/DoctorWorkspaceShell', () => ({
  DoctorWorkspaceShell: shellMock,
}));
vi.mock('@/shared/ui/doctor/DoctorAppShell', () => ({
  DoctorAppShell: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock('@/shared/ui/doctor/shell/DoctorPageHeader', () => ({
  DoctorPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/shared/ui/doctor/pwa/StaffPwaInstallSection', () => ({
  StaffPwaInstallSection: () => <div data-testid="staff-pwa-install" />,
}));

import DoctorInstallPage from './page';

describe('global-admin personal install page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guardMock.mockResolvedValue({
      user: {
        userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        role: 'admin',
        displayName: 'Owner',
        bindings: {},
      },
      adminMode: true,
    });
  });

  it('renders the staff PWA installer through the narrow personal guard', async () => {
    render(await DoctorInstallPage());

    expect(guardMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Установить приложение' })).toBeInTheDocument();
    const installSection = screen.getByTestId('staff-pwa-install');
    expect(installSection).toBeInTheDocument();
    expect(installSection.closest('section')).toHaveClass(
      'rounded-[var(--doctor-page-block-radius,12px)]',
      'p-[var(--doctor-block-padding,18px)]',
    );
    expect(shellMock).toHaveBeenCalledWith(
      expect.objectContaining({ adminMode: true, enableTenantRuntime: false }),
      undefined,
    );
  });
});
