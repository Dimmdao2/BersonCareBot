/** Фильтр по периоду для списка записей специалиста. */
export type DoctorAppointmentsFilter = {
  range: "today" | "tomorrow" | "week";
};

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
  total: number;
  cancellations: number;
  cancellations30d: number;
  reschedules: number;
};

export type DoctorAppointmentsPort = {
  listAppointmentsForSpecialist(filter: DoctorAppointmentsFilter): Promise<AppointmentRow[]>;
  getAppointmentStats(filter: DoctorAppointmentsFilter): Promise<AppointmentStats>;
};
