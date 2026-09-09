import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ChildrenProps = { children?: ReactNode };

const fakes = vi.hoisted(() => ({
  staffPwaBootstrap: vi.fn(),
  staffWebPushBootstrap: vi.fn(),
}));

vi.mock('@/shared/ui/doctor/pwa/StaffPwaBootstrap', () => ({
  StaffPwaBootstrap: () => {
    fakes.staffPwaBootstrap();
    return null;
  },
}));
vi.mock('@/shared/ui/doctor/pwa/StaffWebPushBootstrap', () => ({
  StaffWebPushBootstrap: () => {
    fakes.staffWebPushBootstrap();
    return null;
  },
}));
vi.mock('@/shared/ui/doctor/StaffCalendarTimezoneBootstrap', () => ({
  StaffCalendarTimezoneBootstrap: () => null,
}));
vi.mock('@/shared/ui/AppAccessDeniedToastEffect', () => ({ AppAccessDeniedToastEffect: () => null }));
vi.mock('@/shared/ui/doctor/shell/DoctorShellChromeContext', () => ({
  DoctorShellChromeProvider: ({ children }: ChildrenProps) => children,
}));
vi.mock('@/shared/ui/doctor/shell/DoctorPatientTermsContext', () => ({
  DoctorPatientTermsProvider: ({ children }: ChildrenProps) => children,
}));
vi.mock('@/shared/ui/doctor/DoctorSupportUnreadProvider', () => ({
  DoctorSupportUnreadProvider: ({ children }: ChildrenProps) => children,
}));
vi.mock('@/shared/ui/doctor/shell/DoctorWorkspaceViewport', () => ({
  DoctorWorkspaceViewport: ({ children }: ChildrenProps) => children,
}));
vi.mock('@/shared/ui/doctor/shell/DoctorAdminSidebar', () => ({ DoctorAdminSidebar: () => null }));
vi.mock('@/modules/roles/service', () => ({ canAccessDoctor: () => false }));
vi.mock('@/app-layer/guards/workspaceCapabilities', () => ({
  resolveLaunchCapabilities: () => new Set(),
}));
vi.mock('@/shared/ui/doctor/doctorNavLinks', () => ({ getDoctorShellHomeHref: () => '/app/doctor' }));

import { DoctorWorkspaceShell } from './DoctorWorkspaceShell';

describe('DoctorWorkspaceShell PWA bootstrap boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not mount staff installation or web-push bootstrap on the platform-admin shell', () => {
    render(
      <DoctorWorkspaceShell isPlatformOperator userRole="admin">
        <main>admin</main>
      </DoctorWorkspaceShell>,
    );

    expect(fakes.staffPwaBootstrap).not.toHaveBeenCalled();
    expect(fakes.staffWebPushBootstrap).not.toHaveBeenCalled();
  });

  it('retains both bootstraps for a specialist shell', () => {
    render(
      <DoctorWorkspaceShell isPlatformOperator={false} userRole="doctor">
        <main>doctor</main>
      </DoctorWorkspaceShell>,
    );

    expect(fakes.staffPwaBootstrap).toHaveBeenCalledOnce();
    expect(fakes.staffWebPushBootstrap).toHaveBeenCalledOnce();
  });
});
