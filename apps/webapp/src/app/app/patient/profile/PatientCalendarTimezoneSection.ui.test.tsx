import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientCalendarTimezoneSection } from './PatientCalendarTimezoneSection';

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }));

vi.mock('react-hot-toast', () => ({
  default: { success: toastSuccess, error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  toastSuccess.mockClear();
});

describe('PatientCalendarTimezoneSection', () => {
  // Владелец 18.08: «сохранение пояса не даёт подтверждения» — PATCH проходил, но экран
  // никак не отвечал, и отличить успех от несработавшей кнопки было нельзя.
  it('подтверждает сохранение пояса тостом', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
        Promise.resolve(
          init?.method === 'PATCH'
            ? Response.json({ ok: true })
            : Response.json({
                ok: true,
                calendarTimezone: 'Europe/Moscow',
                appDefaultTimezonePlaceholder: 'Europe/Moscow',
              }),
        ),
      ),
    );

    render(<PatientCalendarTimezoneSection />);

    const save = await screen.findByRole('button', { name: 'Сохранить пояс' });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Часовой пояс сохранён'));
  });

  it('не подтверждает сохранение, когда сервер отказал', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
        Promise.resolve(
          init?.method === 'PATCH'
            ? Response.json({ ok: false, error: 'invalid_timezone' }, { status: 400 })
            : Response.json({
                ok: true,
                calendarTimezone: 'Europe/Moscow',
                appDefaultTimezonePlaceholder: 'Europe/Moscow',
              }),
        ),
      ),
    );

    render(<PatientCalendarTimezoneSection />);

    const save = await screen.findByRole('button', { name: 'Сохранить пояс' });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() =>
      expect(screen.getByText('Выберите корректный пояс из списка.')).toBeInTheDocument(),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
