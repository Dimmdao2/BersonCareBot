import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app-layer/guards/requireRole', () => ({ requirePatientAccess: vi.fn().mockResolvedValue({}) }));
vi.mock('@/shared/ui/patient/PatientAppShell', () => ({
  PatientAppShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/shared/ui/patient/marketing/PwaInstallSection', () => ({
  PwaInstallSection: ({ notificationControls }: { notificationControls?: ReactNode }) => notificationControls,
}));
vi.mock('./WebPushOptInControls', () => ({
  WebPushOptInControls: () => <button type="button">Enable patient push</button>,
}));

import PatientInstallPage from './page';

describe('/app/patient/install notification opt-in', () => {
  it('keeps the existing patient push opt-in inside the established install primitive', async () => {
    render(await PatientInstallPage());

    expect(screen.getByRole('button', { name: 'Enable patient push' })).toBeVisible();
  });
});
