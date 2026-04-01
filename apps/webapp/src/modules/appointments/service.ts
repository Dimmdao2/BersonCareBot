/**
 * Предстоящие записи пациента. Сейчас — расширенный мок с разными статусами для UI кабинета.
 * TODO(AUDIT-BACKLOG-021): заменить на мост Rubitime / integrator при готовности API.
 */

export type AppointmentRecordStatus = "created" | "confirmed" | "rescheduled" | "cancelled";

export type AppointmentSummary = {
  id: string;
  /** Дата без времени (слева в строке). */
  dateLabel: string;
  /** Время без секунд (по центру). */
  timeLabel: string;
  /** Совмещённая подпись для экранов, где нужна одна строка (например, кабинет врача). */
  label: string;
  link: string | null;
  status: AppointmentRecordStatus;
  /** Для отменённых — причина (tooltip). */
  cancelReason?: string | null;
  startsAt?: string | null;
};

export type PastAppointmentSummary = {
  id: string;
  dateLabel: string;
  timeLabel: string;
  label: string;
  link: string | null;
  status: AppointmentRecordStatus;
  /** ISO время записи из проекции (сортировка, дедуп с native booking). */
  recordAtIso?: string | null;
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
 * Заглушка без БД. С `DATABASE_URL` история подгружается через `patientCabinet.getPastAppointments` в DI.
 */
export function getPastAppointments(_userId: string): PastAppointmentSummary[] {
  void _userId;
  return [];
}
