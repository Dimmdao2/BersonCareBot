import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalState, Visit } from '@/modules/patient-clinical/ports';
import { PatientTabOverview } from './PatientTabOverview';

/**
 * A silent, costly failure at this boundary is the active patient card keeping its former
 * append-only/manual-save workflow while the meeting page uses daily autosave. This acceptance
 * test exercises both existing notes entry points and observes the shared daily HTTP behavior.
 */

const userId = '11111111-1111-4111-8111-111111111111';
const today = '2026-09-08';

const emptyClinical: ClinicalState = {
  complaints: [],
  complaintHistory: [],
  diagnoses: [],
  diagnosisHistory: [],
};
const noVisits: Visit[] = [];

function stubDailyNotesFetch() {
  let savedText = '';
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.endsWith(`/api/doctor/clients/${userId}/notes`)) {
      return new Response(JSON.stringify({}), { status: 200 });
    }

    if (init?.method === 'POST') {
      const body = JSON.parse(init.body as string) as {
        noteDate: string;
        text: string;
      };
      savedText = body.text;
      return new Response(
        JSON.stringify({
          ok: true,
          note: { id: 'daily-note', noteDate: body.noteDate, text: body.text, revision: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        today: { iana: 'Europe/Moscow', date: today },
        notes: savedText
          ? [{ id: 'daily-note', noteDate: today, text: savedText, revision: 1 }]
          : [],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
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
      initialProgramActivity={{
        ok: true,
        value: { unreadCount: 0, unreadByStageItemId: {}, lastMark: null },
      }}
      initialAppointments={{ ok: true, value: [] }}
      initialProgramInstances={{ ok: true, value: [] }}
    />,
  );
}

function dailyNotePostCalls(fetchMock: ReturnType<typeof stubDailyNotesFetch>) {
  return fetchMock.mock.calls.filter(
    ([input, init]) =>
      String(input).endsWith(`/api/doctor/clients/${userId}/notes`) && init?.method === 'POST',
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PatientTabOverview daily notes integration (NOTE-04/07, UI-01)', () => {
  it('autosaves through the daily contract and reopens the same note from both notes controls', async () => {
    const fetchMock = stubDailyNotesFetch();
    renderOverview();

    fireEvent.click(screen.getByRole('button', { name: 'Добавить заметку' }));
    let dialog = await screen.findByRole('dialog');
    const textarea = (await within(dialog).findByPlaceholderText(
      'Заметка…',
    )) as HTMLTextAreaElement;

    expect(within(dialog).queryByRole('button', { name: /добавить|сохранить/i })).toBeNull();
    fireEvent.change(textarea, { target: { value: 'Единая дневная заметка' } });
    await waitFor(() => expect(dailyNotePostCalls(fetchMock)).toHaveLength(1));

    const [postInput, postInit] = dailyNotePostCalls(fetchMock)[0] as [string, RequestInit];
    expect(postInput).toBe(`/api/doctor/clients/${userId}/notes`);
    expect(JSON.parse(postInit.body as string)).toMatchObject({
      noteDate: today,
      text: 'Единая дневная заметка',
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Заметок/ }));
    dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByDisplayValue('Единая дневная заметка')).toBeVisible();
  });
});
