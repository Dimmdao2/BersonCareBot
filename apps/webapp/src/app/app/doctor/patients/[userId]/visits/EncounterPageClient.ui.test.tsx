import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ENCOUNTER-APPOINTMENT-03/04/05/06 — the money/linkage contract of «Новый приём».
 *
 * Every failure this file names is expensive AND silent: the doctor sees «Приём сохранён» either
 * way, and the divergence only surfaces later, in the calendar or in the money.
 *
 *   1. OFF branch calls the booking door anyway → a calendar appointment (and its price/payment
 *      snapshot) the specialist explicitly declined.
 *   2. The visit is linked to anything other than the id the door actually returned → the clinical
 *      record points at a stale or invented appointment; card and calendar disagree for good.
 *   3. Conflict «Отмена» writes anyway → an overlapping appointment created without consent.
 *   4. Conflict «Создать наложение» does not repeat THE SAME manual request with `allowOverlap`
 *      → either the consent never reaches the canonical door, or a second simplified write-path
 *      appears next to it.
 *
 * Oracle: docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md §P4.6 and the manual door's
 * own contract (`appointments/manual/route.ts`), not this component.
 */

const routerPush = vi.fn();
const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush, refresh: routerRefresh }) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../tabs/karta/PatientClinicalSections', () => ({
  PatientClinicalCreateModal: () => null,
}));
vi.mock('@/shared/ui/doctor/DoctorDatePicker', () => ({
  DoctorDatePicker: ({ value }: { value: string }) => <span>{value}</span>,
}));
vi.mock('@/shared/ui/doctor/DoctorDateTimePicker', () => ({
  DoctorDateTimePicker: ({ value }: { value: string }) => <span>{value}</span>,
}));
vi.mock('./VisitCatalogTextarea', () => ({ VisitCatalogTextarea: () => null }));

const SPECIALIST = 'aaaaaaaa-0000-4000-8000-000000000001';
const BRANCH = 'bbbbbbbb-0000-4000-8000-000000000002';
const SERVICE = 'cccccccc-0000-4000-8000-000000000003';

/** Stand-in for the canonical calendar form: the page owns the draft, so the test sets it here. */
vi.mock('../../../calendar/DoctorAppointmentForm', () => ({
  DoctorAppointmentForm: ({
    onDraftChange,
  }: {
    onDraftChange: (patch: Record<string, unknown>) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onDraftChange({
          start: '2026-09-25T14:00',
          durationMinutes: 60,
          specialistId: SPECIALIST,
          branchId: BRANCH,
          serviceId: SERVICE,
        })
      }
    >
      fill-appointment-draft
    </button>
  ),
}));

const { EncounterPageClient } = await import('./EncounterPageClient');

const USER = '11111111-1111-4111-8111-111111111111';
const CREATED_APPOINTMENT = 'dddddddd-0000-4000-8000-000000000004';

const CALENDAR_BODY = {
  ok: true,
  timeZone: 'Europe/Moscow',
  resolvedScope: { ownSpecialistId: SPECIALIST, specialists: [{ id: SPECIALIST, label: 'Врач' }] },
  filters: {
    specialists: [{ id: SPECIALIST, label: 'Врач' }],
    branches: [{ id: BRANCH, label: 'Филиал' }],
    rooms: [],
    services: [
      {
        id: SERVICE,
        label: 'Сеанс 60 мин',
        durationMinutes: 60,
        availability: [{ specialistId: SPECIALIST, branchId: BRANCH }],
      },
    ],
  },
};

type Call = { url: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let manualResponses: Array<{ status: number; body: unknown }> = [];

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function installFetch() {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      calls.push({ url, body });
      if (url.includes('/clinical')) {
        return jsonResponse(200, {
          ok: true,
          state: { complaints: [], complaintHistory: [], diagnoses: [], diagnosisHistory: [] },
          visits: [],
        });
      }
      if (url.includes('/appointments/unlinked')) return jsonResponse(200, { ok: true, appointments: [] });
      if (url.includes('/booking-engine/calendar')) return jsonResponse(200, CALENDAR_BODY);
      if (url.includes('/booking-engine/appointments/manual')) {
        const next = manualResponses.shift() ?? { status: 200, body: { ok: true, appointment: { id: CREATED_APPOINTMENT } } };
        return jsonResponse(next.status, next.body);
      }
      if (url.includes('/visits')) return jsonResponse(201, { ok: true, visitId: 'visit-1' });
      return jsonResponse(200, { ok: true });
    }),
  );
}

function renderPage() {
  return render(
    <EncounterPageClient
      mode="create"
      userId={USER}
      patient={{ displayName: 'Иванов Иван', firstName: 'Иван', lastName: 'Иванов', phone: '+79990000000' }}
      ownSpecialistId={SPECIALIST}
      boundAppointmentId={null}
    />,
  );
}

const manualCalls = () => calls.filter((c) => c.url.includes('/booking-engine/appointments/manual'));
const visitCalls = () => calls.filter((c) => /\/visits$/.test(c.url));

async function fillDraftAndSave() {
  await waitFor(() => expect(screen.getByText('fill-appointment-draft')).toBeTruthy());
  fireEvent.click(screen.getByText('fill-appointment-draft'));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить приём' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  manualResponses = [];
  installFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('EncounterPageClient — appointment link contract', () => {
  it('ENCOUNTER-APPOINTMENT-03/06: «Создать запись» off saves the visit and never touches the booking door', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeTruthy());
    fireEvent.click(screen.getByRole('checkbox'));

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: 'Филиал' } });
    fireEvent.change(inputs[1]!, { target: { value: 'Услуга' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить приём' }));

    await waitFor(() => expect(visitCalls()).toHaveLength(1));
    expect(manualCalls()).toEqual([]);
    expect(visitCalls()[0]!.body).not.toHaveProperty('canonicalAppointmentId');
  });

  it('ENCOUNTER-APPOINTMENT-04: the visit is linked to the id the manual door actually returned', async () => {
    renderPage();
    await fillDraftAndSave();

    await waitFor(() => expect(visitCalls()).toHaveLength(1));
    expect(manualCalls()).toHaveLength(1);
    expect(visitCalls()[0]!.body?.canonicalAppointmentId).toBe(CREATED_APPOINTMENT);
  });

  it('ENCOUNTER-APPOINTMENT-05: a conflict stops before any write and «Отмена» leaves nothing created', async () => {
    manualResponses = [{ status: 409, body: { ok: false, error: 'slot_overlap' } }];
    renderPage();
    await fillDraftAndSave();

    await waitFor(() => expect(screen.getByText('Время занято')).toBeTruthy());
    expect(visitCalls()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByText('Время занято')).toBeNull());
    expect(manualCalls()).toHaveLength(1);
    expect(visitCalls()).toEqual([]);
  });

  it('ENCOUNTER-APPOINTMENT-05: «Создать наложение» repeats the same manual request with the consent flag', async () => {
    manualResponses = [{ status: 409, body: { ok: false, error: 'slot_overlap' } }];
    renderPage();
    await fillDraftAndSave();

    await waitFor(() => expect(screen.getByText('Время занято')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Создать наложение' }));

    await waitFor(() => expect(manualCalls()).toHaveLength(2));
    const [first, second] = manualCalls();
    expect(first!.body).not.toHaveProperty('allowOverlap');
    expect(second!.body?.allowOverlap).toBe(true);
    expect({ ...second!.body, allowOverlap: undefined }).toEqual({ ...first!.body, allowOverlap: undefined });

    await waitFor(() => expect(visitCalls()).toHaveLength(1));
    expect(visitCalls()[0]!.body?.canonicalAppointmentId).toBe(CREATED_APPOINTMENT);
  });
});
