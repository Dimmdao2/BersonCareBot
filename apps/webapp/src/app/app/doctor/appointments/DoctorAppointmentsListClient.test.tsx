/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DoctorAppointmentsListClient } from './DoctorAppointmentsListClient';
import type { AppointmentRow } from '@/modules/doctor-appointments/ports';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function makeAppointment(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: 'appt-1',
    clientUserId: 'user-1',
    clientLabel: 'Иванова Мария',
    time: '10:00',
    recordAtIso: '2026-07-08T07:00:00.000Z',
    dateKey: '2026-07-08',
    type: 'Сеанс',
    status: 'Подтверждена',
    link: null,
    cancellationCountForClient: 0,
    branchName: 'Клиника',
    scheduleProvenancePrefix: undefined,
    packageUsageRef: null,
    packageTitle: null,
    packageDisplayNumber: null,
    ...overrides,
  };
}

describe('DoctorAppointmentsListClient', () => {
  it('renders compact membership badge for package-linked appointments', () => {
    render(
      <DoctorAppointmentsListClient
        view="future"
        appointments={[
          makeAppointment({
            packageUsageRef: 'usage-1',
            packageTitle: 'Реабилитация 4 занятия',
            packageDisplayNumber: 7,
          }),
        ]}
      />,
    );

    const badge = screen.getByText('аб.#007');
    expect(badge).toBeTruthy();
    expect(badge).toHaveAttribute('title', 'Реабилитация 4 занятия');
  });
});
