import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="tab-content" /> }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));
vi.mock('@/shared/ui/doctor/DoctorAppShell', () => ({
  DoctorAppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/shared/ui/doctor/shell/DoctorPageHeader', () => ({
  DoctorPageHeader: ({ info, tabs }: { info?: ReactNode; tabs?: ReactNode }) => (
    <header>
      {info}
      {tabs}
    </header>
  ),
}));
vi.mock('@/shared/ui/doctor/primitives/button', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => <button {...props}>{children}</button>,
  buttonVariants: () => 'button',
}));
vi.mock('@/shared/ui/doctor/DoctorSectionTabs', () => ({ doctorSectionTabClass: () => 'tab' }));

import { DoctorCommunicationsShell } from './DoctorCommunicationsShell';

describe('broadcast settings shortcut', () => {
  it('reuses the page-header action slot at the top of the broadcasts screen', () => {
    render(<DoctorCommunicationsShell initialTab="broadcasts" />);

    expect(screen.getByRole('link', { name: 'Настройки уведомлений' })).toHaveAttribute(
      'href',
      '/app/settings?tab=organization#clinic-delivery-channels',
    );
  });
});
