import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('opens the visit history from the summary and opens prepared notes without creating a duplicate visit', async () => {
    const createVisit = vi.fn();
    const createNewVisit = vi.fn();
    const createMembership = vi.fn();
    const openNotes = vi.fn();
    const preparedAppointment = {
      id: 'appointment-with-visit',
      internalId: 'appointment-with-visit',
      dateTime: '2026-08-19T10:00:00.000Z',
      status: 'completed',
      serviceName: 'Консультация',
      location: 'Клиника',
      durationMin: 60,
      hasVisitRecord: true,
    } satisfies PatientAppointmentItem;

    render(
      <PatientTabRecords
        userId={patientId}
        compositionMode="master"
        initialAppointments={[preparedAppointment]}
        initialPackages={[]}
        onCreateVisitFromAppointment={createVisit}
        onCreateVisit={createNewVisit}
        onOpenMembershipConfiguration={createMembership}
        onOpenVisitNotes={openNotes}
      />,
    );

    const addVisitButton = screen.getByRole('button', { name: 'Добавить визит' });
    expect(addVisitButton).toHaveClass(
      'h-full',
      'rounded-none',
      'rounded-r-[var(--doctor-kpi-radius,8px)]',
      'border-l',
      'border-primary/30',
      'bg-primary/5',
      'text-primary',
    );
    expect(addVisitButton).not.toHaveClass('m-1.5');
    fireEvent.click(addVisitButton);
    expect(createNewVisit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Добавить абонемент' }));
    expect(createMembership).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: /Визитов\s*1/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(openNotes).toHaveBeenCalledWith('appointment-with-visit');
    expect(createVisit).not.toHaveBeenCalled();
  });

  it('counts a linked session from its start time and opens it in the membership history', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      respondWith({
        ok: true,
        sessions: [
          {
            appointmentId: 'consumed-appointment',
            startsAt: '2026-08-20T10:00:00.000Z',
            endsAt: '2026-08-20T11:00:00.000Z',
            status: 'completed',
            branchTitle: 'Точка Здоровья',
            serviceTitle: 'Сеанс ЛФК',
            linkage: 'reserved',
            isPast: true,
          },
        ],
      }),
    );

    render(
      <PatientTabRecords
        userId={patientId}
        compositionMode="master"
        initialAppointments={[
          {
            id: 'consumed-appointment',
            internalId: 'consumed-appointment',
            dateTime: '2026-08-20T10:00:00.000Z',
            status: 'completed',
            serviceName: 'Сеанс ЛФК',
            location: 'Точка Здоровья',
            durationMin: 60,
            isPackage: true,
            patientPackageId: 'package-1',
          },
        ]}
        initialPackages={[
          {
            id: 'package-1',
            title: 'ЛФК 4 занятия',
            status: 'active',
            soldAt: '2026-08-01T10:00:00.000Z',
            validUntil: '2026-10-01T00:00:00.000Z',
            priceMinor: 1200000,
            currency: 'RUB',
            paidAmountMinor: 1200000,
            paidCurrency: 'RUB',
            paymentIntentId: 'payment-1',
            balance: {
              items: [
                {
                  quantityInitial: 4,
                  remaining: 2,
                  displayRemaining: 4,
                },
              ],
            },
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Абонемент\s*1 из 4/ }));
    expect(await screen.findByText('ЛФК 4 занятия')).toBeInTheDocument();
    expect(screen.getByText('Онлайн')).toBeInTheDocument();
    expect(await screen.findByText('Сеанс ЛФК')).toBeInTheDocument();
  });

  it('shows visit totals in the fixed modal summary without putting a count in its title', async () => {
    const lateCancellation = {
      id: 'late-cancellation',
      internalId: 'late-cancellation',
      dateTime: '2026-08-19T10:00:00.000Z',
      status: 'canceled',
      isLateCancellation: true,
      serviceName: 'Консультация',
      location: 'Клиника',
      durationMin: 60,
    } satisfies PatientAppointmentItem;

    render(
      <PatientTabRecords
        userId={patientId}
        compositionMode="master"
        initialAppointments={[lateCancellation]}
        initialPackages={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Визитов\s*0/ }));
    expect(await screen.findByRole('dialog', { name: 'Визиты' })).toBeInTheDocument();
    expect(screen.getByText('Поздних отмен 1')).toBeInTheDocument();
    expect(screen.getByText('19.08.2026 · 13:00')).toBeInTheDocument();
    expect(screen.getByText('Консультация · 60 мин')).toBeInTheDocument();
  });

  it('shows the next visit as emphasized secondary text in the visits KPI', () => {
    render(
      <PatientTabRecords
        userId={patientId}
        compositionMode="master"
        initialAppointments={[
          {
            id: 'future-appointment',
            internalId: 'future-appointment',
            dateTime: '2099-01-01T10:00:00+03:00',
            status: 'upcoming',
            serviceName: 'Консультация',
            location: 'Клиника',
            durationMin: 60,
          },
        ]}
        initialPackages={[]}
      />,
    );

    const nextVisit = screen.getByText('След: 01.01');
    expect(nextVisit).toHaveClass('text-sm', 'font-normal', 'text-foreground/80');
  });
});
