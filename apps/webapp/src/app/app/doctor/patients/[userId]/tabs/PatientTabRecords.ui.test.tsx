import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PatientAppointmentItem } from '@/modules/doctor-clients/ports';
import { PatientTabRecords } from './PatientTabRecords';

const patientId = '22222222-2222-4222-8222-222222222222';

/**
 * A failed appointments load used to render three hardcoded demo visits — «Студия на Лесной»,
 * «Тренировка ЛФК», dates in 2026 — inside the patient's own chart, and the visit / cancellation /
 * reschedule counters underneath were computed from them whenever the header carried no totals. A
 * doctor reading that chart saw invented clinical history with real-looking numbers and no way to
 * tell it apart from the patient's actual record.
 *
 * These two cases pin the distinction the fix rests on: a load that FAILED shows no visits and says
 * why, while a load that SUCCEEDED and returned nothing still reads as an ordinary empty history.
 */
/**
 * A fresh Response per call: this tab renders several panels that each fetch, and a Response body can
 * only be read once, so handing every caller the same object makes later panels fail on a consumed
 * body rather than on anything the test meant to simulate.
 */
function respondWith(body: unknown, status = 200): () => Promise<Response> {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('patient records tab — a refused load is not a visit history', () => {
  it('renders no appointment at all when the appointments read fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      respondWith({ ok: false, error: 'repository_unavailable' }, 500),
    );

    render(<PatientTabRecords userId={patientId} />);

    // The failure is stated to the doctor rather than implied by an empty list.
    expect(await screen.findAllByText(/Не удалось загрузить записи/)).not.toHaveLength(0);

    // Nothing from the old demo fixture may reach the chart.
    expect(screen.queryByText(/Студия на Лесной/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Тренировка ЛФК/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Консультация/)).not.toBeInTheDocument();

    // And the counters must not be derived from invented rows.
    expect(screen.queryByText('болезнь')).not.toBeInTheDocument();
  });

  it('still shows an ordinary empty history when the read succeeds with no visits', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(respondWith({ appointments: [] }));

    render(<PatientTabRecords userId={patientId} />);

    expect(await screen.findByText(/Записей пока нет/)).toBeInTheDocument();
    expect(screen.queryByText(/Не удалось загрузить записи/)).not.toBeInTheDocument();
  });

  it('opens notes for an appointment that already has a visit record', async () => {
    const openVisit = vi.fn();
    const preparedAppointment = {
      id: 'appointment-with-visit',
      internalId: 'appointment-with-visit',
      dateTime: '2026-08-19T10:00:00.000Z',
      status: 'completed',
      serviceName: 'Консультация',
      location: 'Клиника',
      durationMin: 60,
      hasVisitRecord: true,
    } satisfies PatientAppointmentItem & { hasVisitRecord: boolean };

    render(
      <PatientTabRecords
        userId={patientId}
        initialAppointments={[preparedAppointment]}
        onCreateVisitFromAppointment={openVisit}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Открыть заметки' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Оформить визит' })).not.toBeInTheDocument();
    expect(openVisit).not.toHaveBeenCalled();
  });
});
