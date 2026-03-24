/**
 * Предстоящие записи пациента. Сейчас — расширенный мок с разными статусами для UI кабинета.
 * TODO: заменить на мост Rubitime / integrator при готовности API.
 */

export type AppointmentRecordStatus = "created" | "confirmed" | "rescheduled" | "cancelled";

export type AppointmentSummary = {
  id: string;
  label: string;
  link: string | null;
  status: AppointmentRecordStatus;
  /** Для отменённых — причина (tooltip). */
  cancelReason?: string | null;
  startsAt?: string | null;
};

export type PastAppointmentSummary = {
  id: string;
  label: string;
  link: string | null;
  status: AppointmentRecordStatus;
  occurredAtLabel: string;
};

/**
 * Fallback без БД: пустой список (честное «нет записей»).
 * UI со статусами тестируется на фикстурах / при `DATABASE_URL` + projection.
 */
export function getUpcomingAppointments(_userId: string): AppointmentSummary[] {
  void _userId;
  return [];
}

/**
 * Прошедшие записи. Пока нет API — пустой массив (история Rubitime / integrator: TODO).
 */
export function getPastAppointments(_userId: string): PastAppointmentSummary[] {
  void _userId;
  return [];
}
