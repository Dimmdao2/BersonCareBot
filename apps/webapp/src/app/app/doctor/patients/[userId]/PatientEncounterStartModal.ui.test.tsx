import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PatientCardHeader } from '@/modules/doctor-clients/ports';

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }));
vi.mock('@/shared/ui/doctor/DoctorModal', () => ({
  DoctorModal: ({
    open,
    title,
    bodyHeader,
    children,
  }: {
    open: boolean;
    title: ReactNode;
    bodyHeader?: ReactNode;
    children: ReactNode;
  }) =>
    open ? (
      <section>
        <header>{title}</header>
        {bodyHeader}
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
const pastTodayAppointmentId = 'cccccccc-0000-4000-8000-000000000003';

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

function installFetchWith(appointments: ReturnType<typeof appointment>[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, appointments }) }) as Response),
  );
}

function installFetch() {
  installFetchWith([
    appointment(laterAppointmentId, '2026-09-07T10:00:00+03:00'),
    appointment(todayAppointmentId, '2026-09-06T18:00:00+03:00'),
  ]);
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

  /**
   * Failure caught: the patient's only appointment today has already passed, so nothing today is
   * still startable; the modal nevertheless preselects TOMORROW's record and the doctor, seeing a
   * ready check mark, confirms — the encounter is silently linked to the wrong calendar record and
   * tomorrow's appointment is consumed. Oracle: owner `ENCOUNTER-LINK-03` («Автовыбор не подставляет
   * запись другого дня»), independent of this component.
   */
  it('does not auto-select an appointment from another day when nothing is left today', async () => {
    installFetchWith([
      appointment(laterAppointmentId, '2026-09-07T10:00:00+03:00'),
      appointment(pastTodayAppointmentId, '2026-09-06T09:00:00+03:00'),
    ]);
    renderModal();

    await screen.findByText(/2026, 10:00/);
    expect(screen.queryByLabelText('Выбрано')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Начать приём' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(routerPush).not.toHaveBeenCalled();
  });

  /**
   * Failure caught: the doctor taps a second appointment; both rows stay checked and confirming
   * sends the first id, so the encounter links to a record the doctor did not choose. Oracle: owner
   * `ENCOUNTER-LINK-06` («Нажатие строки выбирает ровно одну запись») and `ENCOUNTER-LINK-08`
   * («подтверждение открывает полноценную страницу с выбранным appointment ID»).
   */
  it('replaces the auto-selection when another row is tapped and passes exactly that id', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByLabelText('Выбрано')).toBeTruthy());

    fireEvent.click(screen.getByText(/7 сентября 2026, 10:00/));

    expect(screen.getAllByLabelText('Выбрано')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Начать приём' }));

    expect(routerPush).toHaveBeenCalledWith(
      `/app/doctor/patients/${userId}/visits/new?appointmentId=${laterAppointmentId}`,
    );
  });

  /**
   * Failure caught: the doctor picks «Без записи на приём», but the modal still carries the
   * auto-selected appointment id to the encounter page — the encounter is linked to (and consumes)
   * a calendar record the doctor explicitly said does not exist. Oracle: owner `ENCOUNTER-NOLINK-02`
   * («подтверждение открывает полноценную страницу с явно заданным режимом без записи») and
   * `ENCOUNTER-MONEY-01`.
   */
  it('confirms the without-appointment mode with no appointment id at all', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByLabelText('Выбрано')).toBeTruthy());

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Без записи на приём' }));

    await screen.findByText('Будет создан новый приём без записи.');
    expect(screen.queryByLabelText('Выбрано')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Начать приём' }));

    expect(routerPush).toHaveBeenCalledWith(
      `/app/doctor/patients/${userId}/visits/new?withoutAppointment=1`,
    );
  });
});
