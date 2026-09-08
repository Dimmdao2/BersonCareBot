import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TodayNextAppointmentItem } from './loadDoctorTodayDashboard';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./TodayAppointmentFullModal', () => ({ TodayAppointmentFullModal: () => null }));

import { DoctorTodayNextAppointment } from './DoctorTodayNextAppointment';

const appointment: TodayNextAppointmentItem = {
  id: 'appointment-1',
  startAt: '2026-09-10T09:00:00.000Z',
  endAt: '2026-09-10T09:30:00.000Z',
  visitDate: '2026-09-10',
  dateTimeLabel: '10 сентября, 12:00',
  relativeLabel: '',
  isCurrent: true,
  clientLabel: 'Пациент',
  clientUserId: 'patient-1',
  patientOnSupport: false,
  comment: null,
  wasRescheduled: false,
  deliveryFormat: 'online',
};

describe('DoctorTodayNextAppointment video entry', () => {
  /**
   * Owner oracle UI-04: only an online appointment with effective video capability and a linked
   * patient account can lead to the appointment-bound call. A missing capability must retain the
   * ordinary visit path without modifying stored appointment data.
   */
  it('selects the appointment call destination only for an effective online appointment', () => {
    const { rerender } = render(
      <DoctorTodayNextAppointment
        appointment={appointment}
        displayIana="Europe/Moscow"
        videoMeetingsEnabled
      />,
    );
    const liveHref = '/app/doctor/patients/patient-1/live?appointmentId=appointment-1';
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toContain(liveHref);

    rerender(
      <DoctorTodayNextAppointment
        appointment={appointment}
        displayIana="Europe/Moscow"
        videoMeetingsEnabled={false}
      />,
    );
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).not.toContain(liveHref);
    expect(hrefs.some((href) => href?.includes('createVisitFrom=appointment-1'))).toBe(true);
  });
});
