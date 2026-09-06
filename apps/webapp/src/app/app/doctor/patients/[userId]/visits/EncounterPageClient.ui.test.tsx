import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routerPush = vi.fn();
const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));
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

const { EncounterPageClient } = await import('./EncounterPageClient');

const USER = '11111111-1111-4111-8111-111111111111';
const APPOINTMENT = 'dddddddd-0000-4000-8000-000000000004';

type Call = { url: string; body: Record<string, unknown> | null };
let calls: Call[] = [];

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
      if (/\/appointments$/.test(url)) {
        return jsonResponse(200, {
          appointments: [
            {
              id: APPOINTMENT,
              internalId: APPOINTMENT,
              dateTime: '2026-09-06T15:00:00+03:00',
              status: 'upcoming',
              serviceName: 'Приём',
              location: 'Филиал',
              durationMin: 60,
            },
          ],
        });
      }
      if (/\/visits$/.test(url)) return jsonResponse(201, { ok: true, visitId: 'visit-1' });
      return jsonResponse(200, { ok: true });
    }),
  );
}

function renderPage(boundAppointmentId: string | null) {
  return render(
    <EncounterPageClient
      mode="create"
      userId={USER}
      patient={{
        displayName: 'Иванов Иван',
        firstName: 'Иван',
        lastName: 'Иванов',
        phone: '+79990000000',
      }}
      boundAppointmentId={boundAppointmentId}
    />,
  );
}

const manualCalls = () => calls.filter((call) => call.url.includes('/appointments/manual'));
const visitCalls = () => calls.filter((call) => /\/visits$/.test(call.url));

beforeEach(() => {
  vi.clearAllMocks();
  installFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('EncounterPageClient — linkage selected before the encounter page', () => {
  it('saves the explicit without-appointment flow without touching the booking door', async () => {
    renderPage(null);

    expect(screen.queryByText('Связь с записью')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Создать запись' })).toBeNull();

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: 'Филиал' } });
    fireEvent.change(inputs[1]!, { target: { value: 'Услуга' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить приём' }));

    await waitFor(() => expect(visitCalls()).toHaveLength(1));
    expect(manualCalls()).toEqual([]);
    expect(visitCalls()[0]!.body).not.toHaveProperty('canonicalAppointmentId');
  });

  it('keeps the preselected appointment id as the visit linkage', async () => {
    renderPage(APPOINTMENT);
    await screen.findByText(/Связан с записью:/);

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: 'Филиал' } });
    fireEvent.change(inputs[1]!, { target: { value: 'Приём' } });

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить приём' }));

    await waitFor(() => expect(visitCalls()).toHaveLength(1));
    expect(manualCalls()).toEqual([]);
    expect(visitCalls()[0]!.body?.canonicalAppointmentId).toBe(APPOINTMENT);
  });
});
