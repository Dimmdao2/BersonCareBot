/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { routePaths } from '@/app-layer/routes/paths';
import { PatientProfileHero } from './PatientProfileHero';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: pushMock }),
}));

describe('PatientProfileHero', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the supplied structured greeting as static given-name content', () => {
    render(
      <PatientProfileHero
        displayName="Иван"
        phone={null}
        supportContactHref="https://support.example"
        fallbackDisplayName="Гость"
        initialEmail={null}
        emailVerified={false}
      />,
    );

    expect(screen.getByText('Имя')).toBeInTheDocument();
    expect(screen.getByText('Иван')).toBeInTheDocument();
    expect(screen.queryByText('ФИО')).not.toBeInTheDocument();
  });

  it('shows bind link when no phone and redirects to bind-phone', async () => {
    pushMock.mockClear();
    const user = userEvent.setup();
    render(
      <PatientProfileHero
        displayName="Test"
        phone={null}
        supportContactHref="https://support.example"
        fallbackDisplayName="."
        initialEmail={null}
        emailVerified={false}
      />,
    );

    const bindButtons = screen.getAllByRole('button', { name: 'Привязать' });
    expect(bindButtons).toHaveLength(2);
    expect(screen.queryByLabelText('Номер телефона')).not.toBeInTheDocument();

    await user.click(bindButtons[0]!);

    expect(pushMock).toHaveBeenCalledWith(
      `${routePaths.bindPhone}?next=${encodeURIComponent(routePaths.profile)}`,
    );
  });

  it('shows phone and redirects to bind-phone when editing', async () => {
    pushMock.mockClear();
    const user = userEvent.setup();
    render(
      <PatientProfileHero
        displayName="Test"
        phone="+79991234567"
        supportContactHref="https://support.example"
        fallbackDisplayName="."
        initialEmail={null}
        emailVerified={false}
      />,
    );

    expect(screen.getByText('+79991234567')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Изменить' }));

    expect(pushMock).toHaveBeenCalledWith(
      `${routePaths.bindPhone}?next=${encodeURIComponent(routePaths.profile)}`,
    );
  });

  it('starts email confirmation from saved unverified email', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({ ok: true, challengeId: 'ch-1' }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <PatientProfileHero
        displayName="Test"
        phone="+79991234567"
        supportContactHref="https://support.example"
        fallbackDisplayName="."
        initialEmail="user@example.com"
        emailVerified={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Подтвердить' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ email: 'user@example.com' }));
    expect(await screen.findByLabelText('Код подтверждения')).toBeInTheDocument();
  });
});
