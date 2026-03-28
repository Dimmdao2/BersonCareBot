/** Диапазон для агрегатов `getAppointmentStats` (сегодня / завтра / неделя от UTC-полуночи). */
export type DoctorAppointmentsStatsRange = "today" | "tomorrow" | "week";

export type DoctorAppointmentStatsFilter = {
  range: DoctorAppointmentsStatsRange;
};

/**
 * Режим списка записей на `/app/doctor/appointments`.
 * `range` — окно по `record_at`; остальные — согласованы с плитками дашборда (см. docs/ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md).
 */
export type DoctorAppointmentsListFilter =
  | { kind: "range"; range: DoctorAppointmentsStatsRange }
  | { kind: "futureActive" }
  | { kind: "recordsInCalendarMonth" }
  | { kind: "cancellationsInCalendarMonth" };

/** Строка записи в списке специалиста. */
export type AppointmentRow = {
  id: string;
  clientUserId: string;
  clientLabel: string;
  time: string;
  type: string;
  status: string;
  link: string | null;
  cancellationCountForClient: number;
  /** Branch name from Rubitime (if linked). */
  branchName: string | null;
};

/** Агрегатная статистика по записям. */
export type AppointmentStats = {
  /** Все строки в окне по `record_at`, только не soft-delete (включая отменённые). */
  total: number;
  cancellations: number;
  cancellations30d: number;
  reschedules: number;
};

/** Метрики записей для дашборда врача (этап 9). Семантика — в DOCTOR_DASHBOARD_METRICS.md. */
export type DoctorDashboardAppointmentMetrics = {
  /** Будущие активные: created/updated, `record_at >= now()`, не удалено. */
  futureActiveCount: number;
  /** Все не удалённые строки с `record_at` в текущем UTC-месяце (любой статус). */
  recordsInCalendarMonthTotal: number;
  /** Отмены: `status=canceled`, фильтр last_event, `updated_at` в текущем UTC-месяце. */
  cancellationsInCalendarMonth: number;
};

export type DoctorAppointmentsPort = {
  listAppointmentsForSpecialist(filter: DoctorAppointmentsListFilter): Promise<AppointmentRow[]>;
  getAppointmentStats(filter: DoctorAppointmentStatsFilter): Promise<AppointmentStats>;
  /** Агрегаты для плиток дашборда; без React. */
  getDashboardAppointmentMetrics(): Promise<DoctorDashboardAppointmentMetrics>;
};
