import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminAuthRegistrationEventsSection } from './AdminAuthRegistrationEventsSection';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('registration events load state', () => {
  it('shows a retry notice instead of an empty table when loading fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network');
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminAuthRegistrationEventsSection />);

    expect(await screen.findByText('Не удалось загрузить события регистрации.')).toBeVisible();
    expect(screen.getByText(/AUTH-REGISTRATION-EVENTS/)).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('network')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
