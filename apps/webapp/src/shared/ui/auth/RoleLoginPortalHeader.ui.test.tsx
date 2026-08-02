import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoleLoginPortalHeader } from './RoleLoginPortalHeader';

describe('RoleLoginPortalHeader', () => {
  it.each([
    ['doctor', 'Вход для специалистов и сотрудников клиники'],
    ['patient', 'Вход для пациентов'],
    ['admin', 'Вход для администратора'],
  ] as const)('renders a distinct %s portal surface', (portal, title) => {
    render(<RoleLoginPortalHeader portal={portal} />);

    expect(screen.getByRole('heading', { name: title })).toBeVisible();
  });

  it('uses static cross-portal links for doctor and patient doors', () => {
    const view = render(<RoleLoginPortalHeader portal="doctor" />);

    expect(screen.getByRole('link', { name: 'Войти как пациент' })).toHaveAttribute(
      'href',
      '/app/patient/login',
    );
    view.rerender(<RoleLoginPortalHeader portal="patient" />);
    expect(screen.getByRole('link', { name: 'Войти как специалист' })).toHaveAttribute(
      'href',
      '/app/doctor/login',
    );
  });
});
