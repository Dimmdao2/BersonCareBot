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
  /** Optional schedule source marker for compatibility/import provenance. */
  scheduleProvenancePrefix?: string;
};

/**
 * Fallback без БД: пустой список (честное «нет записей»).
 * UI со статусами тестируется на фикстурах / при `DATABASE_URL` + projection.
 */
export function getUpcomingAppointments(_userId: string): AppointmentSummary[] {
  void _userId;
  return [];
}
