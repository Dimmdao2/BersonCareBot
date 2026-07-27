/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffSecuritySection } from './StaffSecuritySection';

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));

vi.mock('react-hot-toast', () => ({
  default: { error: toastErrorMock, success: vi.fn() },
}));

describe('StaffSecuritySection first-run acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the truthful Account checklist and retries an incomplete organization setup', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: false }), { status: 409 }),
    );

    render(
      <StaffSecuritySection
        initialStatus={{
          enrolled: false,
          recoveryConfirmed: false,
          replacementRequired: false,
          lockedUntil: null,
        }}
        hasProfileName
        hasTimezone
        hasOrganization={false}
        hasSpecialistBinding={false}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Первый запуск' })).toBeInTheDocument();
    expect(screen.getByText('○ Кабинет создан')).toBeInTheDocument();
    expect(screen.getByText('○ Двухфакторная защита и резервные коды')).toBeInTheDocument();
    expect(screen.queryByText(/Практик/u)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Подключить рабочий кабинет' }),
    ).not.toBeInTheDocument();

    // A stuck pre-provisioning account has no clinical/org capability, so the desktop shell hides
    // its own header/sidebar logout entirely; the first-run checklist must offer its own way out.
    const logoutButton = screen.getByRole('button', { name: 'Выйти' });
    expect(logoutButton).toHaveAttribute('type', 'submit');
    const logoutForm = logoutButton.closest('form');
    expect(logoutForm).toHaveAttribute('action', '/api/auth/logout');
    expect(logoutForm).toHaveAttribute('method', 'post');

    await userEvent.click(screen.getByRole('button', { name: 'Повторить настройку аккаунта' }));

    expect(fetch).toHaveBeenCalledWith('/api/auth/specialist-signup/retry', {
      method: 'POST',
      headers: undefined,
      body: undefined,
    });
    expect(toastErrorMock).toHaveBeenCalledWith('Аккаунт ещё не готов. Повторите позже.');
  });

  it('offers exact specialist binding only after factor and recovery readiness', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'verified_security_required' }), {
        status: 403,
      }),
    );

    render(
      <StaffSecuritySection
        initialStatus={{
          enrolled: true,
          recoveryConfirmed: true,
          replacementRequired: false,
          lockedUntil: null,
        }}
        hasProfileName
        hasTimezone
        hasOrganization
        hasSpecialistBinding={false}
      />,
    );

    expect(screen.getByText('✓ Двухфакторная защита и резервные коды')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Подключить рабочий кабинет' }));

    expect(fetch).toHaveBeenCalledWith('/api/account/first-run/bind-specialist', {
      method: 'POST',
      headers: undefined,
      body: undefined,
    });
    expect(toastErrorMock).toHaveBeenCalledWith('Сначала завершите настройку защиты аккаунта');
  });

  it('keeps recovery sessions on the replacement-only Account security surface', () => {
    render(
      <StaffSecuritySection
        initialStatus={{
          enrolled: true,
          recoveryConfirmed: true,
          replacementRequired: true,
          lockedUntil: null,
        }}
        hasProfileName
        hasTimezone
        hasOrganization
        hasSpecialistBinding
        recoveryOnly
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Первый запуск' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Защита аккаунта' })).toBeInTheDocument();
    expect(
      screen.getByText('Вход выполнен резервным кодом. Подключите фактор заново.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Подключить приложение-аутентификатор' }),
    ).toBeInTheDocument();
    // The first-run logout affordance lives only in the "Первый запуск" block above; the
    // replacement-only recovery surface is out of scope for this exact stuck-signup fix.
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();
  });

  it.each([
    ['wrong_current_password', 'Текущий пароль указан неверно.'],
    ['weak_new_password', 'Новый пароль должен содержать от 8 до 128 символов.'],
    ['rate_limited', 'Слишком много попыток. Повторите через 10 минут.'],
    [
      'password_changed_session_reissue_failed',
      'Пароль изменён, но сеанс завершён. Войдите снова.',
    ],
  ])('shows an actionable password-change error for %s', async (error, message) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error,
          ...(error === 'password_changed_session_reissue_failed'
            ? { passwordChanged: true }
            : {}),
        }),
        { status: error === 'password_changed_session_reissue_failed' ? 500 : 400 },
      ),
    );

    render(
      <StaffSecuritySection
        initialStatus={{
          enrolled: true,
          recoveryConfirmed: true,
          replacementRequired: false,
          lockedUntil: null,
        }}
        hasProfileName
        hasTimezone
        hasOrganization
        hasSpecialistBinding
      />,
    );

    await userEvent.type(screen.getByLabelText('Текущий пароль'), 'current-password');
    await userEvent.type(screen.getByLabelText('Новый пароль'), 'new-password');
    await userEvent.click(screen.getByRole('button', { name: 'Сменить пароль' }));

    expect(fetch).toHaveBeenCalledWith('/api/account/security/password/change', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'current-password',
        newPassword: 'new-password',
      }),
    });
    expect(toastErrorMock).toHaveBeenCalledWith(message);
  });
});
