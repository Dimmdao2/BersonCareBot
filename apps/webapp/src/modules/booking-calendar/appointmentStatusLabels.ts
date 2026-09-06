import type { AppointmentStatus } from '@/modules/booking-engine/types';

const LABELS: Record<AppointmentStatus, string> = {
  created: 'Создана',
  awaiting_payment: 'Ожидает оплаты',
  paid: 'Оплачена',
  confirmed: 'Подтверждена',
  rescheduled: 'Перенесена',
  cancelled_by_patient: 'Отмена пациентом',
  cancelled_by_specialist: 'Отмена специалистом',
  late_cancellation: 'Поздняя отмена',
  no_show: 'Неявка',
  completed: 'Завершена',
  visit_confirmed: 'Визит подтверждён',
  charged_to_package: 'По абонементу',
  manual_review_required: 'На проверке',
};

export function appointmentStatusLabel(status: AppointmentStatus | string): string {
  return LABELS[status as AppointmentStatus] ?? status;
}

export function isCancelledAppointmentStatus(status: string): boolean {
  return (
    status === 'cancelled_by_patient' ||
    status === 'cancelled_by_specialist' ||
    status === 'late_cancellation' ||
    status === 'no_show'
  );
}

/**
 * PAY-APPT-13/14: «ожидает оплаты» is one fact with two sources — the canonical appointment status
 * and the booking-engine `prepaymentPending` flag the feed carries alongside it. Every doctor
 * surface asks this one predicate instead of re-spelling the `status === 'awaiting_payment' ||
 * prepaymentPending` pair, so list, calendar grids and the event panel cannot drift apart.
 */
export function isPaymentPendingAppointment(appointment: {
  status: string;
  prepaymentPending?: boolean;
}): boolean {
  return appointment.status === 'awaiting_payment' || appointment.prepaymentPending === true;
}

/** Staff «Удалить» — только явная отмена (без no_show). */
export const STAFF_DELETABLE_STATUSES = [
  'cancelled_by_patient',
  'cancelled_by_specialist',
  'late_cancellation',
] as const;

export type StaffDeletableCancelledStatus = (typeof STAFF_DELETABLE_STATUSES)[number];

export function isStaffDeletableCancelledStatus(status: string): boolean {
  return (STAFF_DELETABLE_STATUSES as readonly string[]).includes(status);
}
