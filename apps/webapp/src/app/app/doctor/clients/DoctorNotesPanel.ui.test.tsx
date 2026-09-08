import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DoctorNotesPanel } from './DoctorNotesPanel';

const USER_ID = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function dailyPanelPayload(notes: unknown[] = []) {
  return { ok: true, today: { iana: 'Europe/Moscow', date: '2026-09-08' }, notes };
}

function postCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
}

describe('DoctorNotesPanel daily history (NOTE-05/08)', () => {
  it('lets a specialist collapse a past note again after expanding it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            today: { iana: 'Europe/Moscow', date: '2026-09-08' },
            notes: [
              {
                id: 'past-note',
                noteDate: '2026-09-06',
                text: 'Историческая заметка',
                revision: 3,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    render(<DoctorNotesPanel userId={USER_ID} />);

    const dateButton = await screen.findByRole('button', { name: /6 сентября 2026/i });
    expect(dateButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(dateButton);
    await waitFor(() => expect(screen.getByDisplayValue('Историческая заметка')).toBeVisible());

    fireEvent.click(dateButton);
    await waitFor(() => {
      expect(screen.queryByDisplayValue('Историческая заметка')).toBeNull();
      expect(dateButton).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('autosaves today without a separate add/save lifecycle (NOTE-04)', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? jsonResponse({
            ok: true,
            note: { id: 'today-note', noteDate: '2026-09-08', text: 'Новая запись', revision: 1 },
          })
        : jsonResponse(dailyPanelPayload()),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<DoctorNotesPanel userId={USER_ID} />);
    const textarea = await screen.findByPlaceholderText('Заметка…');
    fireEvent.change(textarea, { target: { value: 'Новая запись' } });
    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(1));

    const calls = postCalls(fetchMock);
    expect(calls).toHaveLength(1);
    expect(JSON.parse((calls[0]?.[1] as RequestInit).body as string)).toMatchObject({
      noteDate: '2026-09-08',
      text: 'Новая запись',
    });
  });

  it('keeps newer local text when an older save response arrives late (NOTE-07)', async () => {
    let resolveFirstSave: ((response: Response) => void) | undefined;
    let saveAttempts = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'POST') return Promise.resolve(jsonResponse(dailyPanelPayload()));
      saveAttempts += 1;
      if (saveAttempts === 1) {
        return new Promise<Response>((resolve) => {
          resolveFirstSave = resolve;
        });
      }
      return Promise.resolve(
        jsonResponse({
          ok: true,
          note: { id: 'today-note', noteDate: '2026-09-08', text: 'Новый текст', revision: 2 },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<DoctorNotesPanel userId={USER_ID} />);
    const textarea = (await screen.findByPlaceholderText('Заметка…')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Старый текст' } });
    await waitFor(() => expect(resolveFirstSave).toBeTypeOf('function'));

    fireEvent.change(textarea, { target: { value: 'Новый текст' } });
    resolveFirstSave?.(
      jsonResponse({
        ok: true,
        note: { id: 'today-note', noteDate: '2026-09-08', text: 'Старый текст', revision: 1 },
      }),
    );

    await waitFor(() => expect(textarea.value).toBe('Новый текст'), { timeout: 100 });
    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(2));
    expect(textarea.value).toBe('Новый текст');
    expect(JSON.parse((postCalls(fetchMock)[1]?.[1] as RequestInit).body as string).text).toBe(
      'Новый текст',
    );
  });

  it('retains a local draft through a failed request and retries without reload (NOTE-07)', async () => {
    let saveAttempts = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'POST') return Promise.resolve(jsonResponse(dailyPanelPayload()));
      saveAttempts += 1;
      if (saveAttempts === 1) return Promise.reject(new Error('network down'));
      return Promise.resolve(
        jsonResponse({
          ok: true,
          note: { id: 'today-note', noteDate: '2026-09-08', text: 'Черновик', revision: 1 },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<DoctorNotesPanel userId={USER_ID} />);
    const textarea = (await screen.findByPlaceholderText('Заметка…')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Черновик' } });
    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(1));

    expect(textarea.value).toBe('Черновик');
    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(2), { timeout: 2500 });
    expect(textarea.value).toBe('Черновик');
  });

  it('does not remount or blur the active editor after its autosave response (NOTE-08)', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? jsonResponse({
            ok: true,
            note: { id: 'today-note', noteDate: '2026-09-08', text: 'Текст', revision: 1 },
          })
        : jsonResponse(dailyPanelPayload()),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<DoctorNotesPanel userId={USER_ID} />);
    const textarea = await screen.findByPlaceholderText('Заметка…');
    textarea.focus();
    fireEvent.change(textarea, { target: { value: 'Текст' } });
    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(1));

    expect(document.activeElement).toBe(textarea);
  });
});
