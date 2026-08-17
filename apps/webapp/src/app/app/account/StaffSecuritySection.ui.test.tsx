import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/ui/auth/PasswordAltchaChallenge', () => ({
  PasswordAltchaChallenge: () => <div data-testid="password-altcha" />,
}));

import { StaffSecuritySection } from './StaffSecuritySection';

const status = {
  enrolled: false,
  recoveryConfirmed: false,
  replacementRequired: false,
  lockedUntil: null,
};

describe('StaffSecuritySection role/capability projection', () => {
  it('hides every specialist first-run entry for the platform console but keeps password change', () => {
    render(
      <StaffSecuritySection
        initialStatus={status}
        hasProfileName
        hasTimezone
        hasOrganization
        hasSpecialistBinding={false}
        showSpecialistFirstRun={false}
      />,
    );

    expect(screen.queryByText('Подключить рабочий кабинет')).not.toBeInTheDocument();
    expect(screen.queryByText('Первый запуск')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сменить пароль' })).toBeInTheDocument();
  });

  it('keeps the self-binding action visible for an eligible clinic owner', () => {
    render(
      <StaffSecuritySection
        initialStatus={status}
        hasProfileName
        hasTimezone
        hasOrganization
        hasSpecialistBinding={false}
        showSpecialistFirstRun
      />,
    );

    expect(screen.getByRole('button', { name: 'Подключить рабочий кабинет' })).toBeInTheDocument();
  });
});
