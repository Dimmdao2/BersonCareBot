/**
 * Пояс пациента определяется устройством и догоняет его при переезде молча (§34 канона владельца;
 * владелец, 20.08 — «не спрашивать»). Именно этот пояс читает воркер уведомлений, поэтому отставший
 * пояс = напоминание не в своё время; лишняя запись на каждой загрузке = шум в БД и лишний refresh.
 */
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientCalendarTimezoneBootstrap } from './PatientCalendarTimezoneBootstrap';

vi.mock('@/shared/lib/browserCalendarIana', () => ({
  getBrowserCalendarIanaForAuth: () => 'Europe/Moscow',
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function postCalls() {
  return fetchMock.mock.calls.filter(
    (call) => (call[1] as RequestInit | undefined)?.method === 'POST',
  );
}

function respondWithStored(calendarTimezone: string | null) {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? Response.json({ ok: true })
      : Response.json({ ok: true, calendarTimezone }),
  );
}

describe('PatientCalendarTimezoneBootstrap', () => {
  it('записывает пояс устройства, когда у пациента его ещё нет', async () => {
    respondWithStored(null);

    render(<PatientCalendarTimezoneBootstrap />);

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(JSON.parse(postCalls()[0]![1]!.body as string)).toEqual({
      browserCalendarIana: 'Europe/Moscow',
    });
  });

  it('догоняет устройство, когда человек переехал', async () => {
    respondWithStored('Asia/Novosibirsk');

    render(<PatientCalendarTimezoneBootstrap />);

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('молчит, когда сохранённый пояс уже совпадает с устройством', async () => {
    respondWithStored('Europe/Moscow');

    render(<PatientCalendarTimezoneBootstrap />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(postCalls()).toHaveLength(0);
    expect(refresh).not.toHaveBeenCalled();
  });
});
