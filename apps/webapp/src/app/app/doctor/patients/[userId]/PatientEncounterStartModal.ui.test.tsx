import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PatientCardHeader } from '@/modules/doctor-clients/ports';

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }));
vi.mock('@/shared/ui/doctor/DoctorModal', () => ({
  DoctorModal: ({ open, title, children }: { open: boolean; title: ReactNode; children: ReactNode }) =>
    open ? (
      <section>
        <header>{title}</header>
        {children}
      </section>
    ) : null,
  DoctorModalFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  DoctorModalStackedTitle: ({ label, patientName }: { label: ReactNode; patientName: string }) => (
    <span>
      {label} {patientName}
    </span>
  ),
}));
vi.mock('@/app/app/doctor/calendar/DoctorNewAppointmentModal', () => ({
  DoctorAppointmentCreatePanel: () => null,
}));

const { PatientEncounterStartModal } = await import('./PatientEncounterStartModal');

const userId = '11111111-1111-4111-8111-111111111111';
const todayAppointmentId = 'aaaaaaaa-0000-4000-8000-000000000001';
const laterAppointmentId = 'bbbbbbbb-0000-4000-8000-000000000002';

const header: PatientCardHeader = {
  identity: {
    userId,
    displayName: 'Иванова Мария',
    firstName: 'Мария',
    lastName: 'Иванова',
    patronymic: null,
    phone: '+79990000000',
    email: null,
    emailVerifiedAt: null,
    telegramUsername: null,
    maxUsername: null,
    bindings: {},
    hasConversation: false,
    isArchived: false,
    isBlocked: false,
    birthDate: null,
    age: null,
    gender: null,
  },
  support: { isOnSupport: false, startedAt: null, supportMonthsApprox: null },
  lastVisit: null,
  nextAppointment: null,
  totalVisits: 0,
  cancellationsCount: 0,
  reschedulesCount: 0,
  firstVisitDate: null,
};

function appointment(id: string, dateTime: string) {
  return {
    id,
    internalId: id,
    dateTime,
    status: 'upcoming' as const,
    serviceName: 'Приём',
    location: 'Филиал',
    durationMin: 60,
    hasVisitRecord: false,
  };
}

function installFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({
          ok: true,
          appointments: [
            appointment(laterAppointmentId, '2026-09-07T10:00:00+03:00'),
            appointment(todayAppointmentId, '2026-09-06T18:00:00+03:00'),
          ],
        }),
      }) as Response,
    ),
  );
}

function renderModal(initialAppointmentId: string | null = null) {
  return render(
    <PatientEncounterStartModal
      open
      userId={userId}
      header={header}
      displayIana="Europe/Moscow"
      todayIso="2026-09-06"
      initialAppointmentId={initialAppointmentId}
      onClose={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
  installFetch();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PatientEncounterStartModal — pre-page appointment choice', () => {
  it('automatically selects the next available appointment today', async () => {
    renderModal();
    await screen.findByText('Ближайшая запись сегодня');
    await waitFor(() => expect(screen.getByLabelText('Выбрано')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Начать приём' }));

    expect(routerPush).toHaveBeenCalledWith(
      `/app/doctor/patients/${userId}/visits/new?appointmentId=${todayAppointmentId}`,
    );
  });

  it('keeps an explicitly prebound appointment selected even when it is not today', async () => {
    renderModal(laterAppointmentId);
    await waitFor(() => expect(screen.getByLabelText('Выбрано')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Начать приём' }));

    expect(routerPush).toHaveBeenCalledWith(
      `/app/doctor/patients/${userId}/visits/new?appointmentId=${laterAppointmentId}`,
    );
  });
});
