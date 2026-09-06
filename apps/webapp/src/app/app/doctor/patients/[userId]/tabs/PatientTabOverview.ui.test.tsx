import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalState, Visit } from '@/modules/patient-clinical/ports';
import { PatientTabOverview } from './PatientTabOverview';

/**
 * PATIENT-NOTE-EDITOR-01..03: «Новая заметка» reuses the shared fullscreen single-field editor
 * (MODAL-TEXT-01..08, covered independently in DoctorModal.ui.test.tsx). This file locks in the
 * observable contract at this call site: opening focuses the textarea immediately, cancel creates
 * no note, and save calls the existing note-creation endpoint exactly once.
 */

const userId = '11111111-1111-4111-8111-111111111111';

const emptyClinical: ClinicalState = {
  complaints: [],
  complaintHistory: [],
  diagnoses: [],
  diagnosisHistory: [],
};
const noVisits: Visit[] = [];

function stubFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/notes') && init?.method === 'POST') {
      return {
        ok: true,
        json: async () => ({
          note: { id: 'note-1', text: JSON.parse(init.body as string).text, updatedAt: '2026-09-06T10:00:00.000Z' },
        }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderOverview() {
  return render(
    <PatientTabOverview
      userId={userId}
      membershipsVisible={false}
      specialistTasksAvailable={false}
      specialistTasksReadable={false}
      initialClinicalState={{ ok: true, value: emptyClinical }}
      initialVisits={{ ok: true, value: noVisits }}
      initialNotes={{ ok: true, value: [] }}
      initialTasks={{ ok: true, value: [] }}
      initialProgramActivity={{ ok: true, value: { unreadCount: 0, unreadByStageItemId: {}, lastMark: null } }}
      initialAppointments={{ ok: true, value: [] }}
      initialProgramInstances={{ ok: true, value: [] }}
    />,
  );
}

function noteFetchCalls(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/notes'));
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PatientTabOverview — «Новая заметка» fullscreen editor (PATIENT-NOTE-EDITOR-01..03)', () => {
  it('opens with a focused textarea; cancel creates no note', async () => {
    const fetchMock = stubFetch();
    renderOverview();

    fireEvent.click(screen.getByRole('button', { name: 'Добавить заметку' }));
    const dialog = await screen.findByRole('dialog');
    const textarea = within(dialog).getByPlaceholderText('Текст заметки…') as HTMLTextAreaElement;
    expect(document.activeElement).toBe(textarea);

    fireEvent.change(textarea, { target: { value: 'Черновик без сохранения' } });
    fireEvent.click(within(dialog).getByText('Отмена'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(noteFetchCalls(fetchMock)).toHaveLength(0);
  });

  it('save calls the existing note-creation endpoint exactly once and closes the editor', async () => {
    const fetchMock = stubFetch();
    renderOverview();

    fireEvent.click(screen.getByRole('button', { name: 'Добавить заметку' }));
    const dialog = await screen.findByRole('dialog');
    const textarea = within(dialog).getByPlaceholderText('Текст заметки…') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: 'Первая заметка' } });
    fireEvent.click(within(dialog).getByText('Сохранить'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const calls = noteFetchCalls(fetchMock);
    expect(calls).toHaveLength(1);
    const [, init] = calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Первая заметка' });
  });
});
