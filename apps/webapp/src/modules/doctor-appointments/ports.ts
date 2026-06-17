import type { AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";

/** Диапазон для агрегатов `getAppointmentStats` (сегодня / завтра / неделя в `app_display_timezone`). */
export type DoctorAppointmentsStatsRange = "today" | "tomorrow" | "week";

export type DoctorAppointmentStatsFilter =
  | { kind: "range"; range: DoctorAppointmentsStatsRange }
  | {
      kind: "preset";
      preset: AdminStatsTimePreset;
      customFrom?: string;
      customTo?: string;
    };

/**
 * Режим списка записей на `/app/doctor/appointments`.
 * `range` — окно по `record_at`; остальные — согласованы с плитками дашборда (см. docs/ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md).
 */
export type DoctorAppointmentsListFilter =
  | { kind: "range"; range: DoctorAppointmentsStatsRange }
  /** Диапазон как в `getAppointmentStats.total` (включая отмененные). Для KPI drill-down. */
  | { kind: "statsRange"; range: DoctorAppointmentsStatsRange }
  | { kind: "futureActive" }
  | { kind: "recordsInCalendarMonth" }
  | { kind: "cancellationsInCalendarMonth" }
  /** Отмены за 30 суток по `updated_at` — как в `getAppointmentStats.cancellations30d`. */
  | { kind: "cancellations30d" }
  /** Прошедшие записи с пагинацией для архива. */
  | { kind: "past"; limit?: number; offset?: number };

/** Строка записи в списке специалиста. */
export type AppointmentRow = {
  id: string;
  clientUserId: string;
  clientLabel: string;
  time: string;
  /** Момент записи (UTC ISO); если задан, сервис пересчитывает `time` в бизнес-таймзоне. */
  recordAtIso: string | null;
  /** Дата записи в бизнес-таймзоне (YYYY-MM-DD); "" если recordAtIso == null. Для группировки по датам. */
  dateKey: string;
  type: string;
  status: string;
  link: string | null;
  cancellationCountForClient: number;
  /** Branch name from Rubitime (if linked). */
  branchName: string | null;
  /** F-04: маркер происхождения (все строки из `appointment_records`). */
  scheduleProvenancePrefix?: string;
  /** Имя из Rubitime (`payload_json.name`), если отличается от профильной подписи; иначе `null`. */
  rubitimeNameIfDifferent: string | null;
};

/** Агрегатная статистика по записям за календарное окно (`app_display_timezone`). */
export type AppointmentStats = {
  /** Прошедшие визиты: `start_at` в окне, уже наступили, без отменённых статусов. */
  pastVisitsInPeriod: number;
  /** Слоты в окне со статусом отмены (по времени визита). */
  cancelledVisitsInPeriod: number;
  /** Новые записи: `created_at` в окне (дата приёма может быть любой). */
  bookingsCreatedInPeriod: number;
  /** Действия «отмена сеанса» (`be_appointment_cancellations.created_at` в окне). */
  cancellationActionsInPeriod: number;
  /** Действия «перенос» (`be_appointment_reschedules.created_at` в окне). */
  rescheduleActionsInPeriod: number;
  /** Неотменённые строки в окне по `start_at` — KPI «Сегодня»: записи сегодня/на неделю. */
  total: number;
  /** Отмены за 30 суток по `updated_at` — KPI «Сегодня». */
  cancellations30d: number;
  /** Записи в периоде, у пациента которых НЕТ более ранней неотменённой записи (по phone_normalized). */
  firstVisitInPeriod: number;
  /** pastVisitsInPeriod − firstVisitInPeriod. */
  repeatVisitInPeriod: number;
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

export type DoctorAppointmentsAudience = { excludedUserIds?: string[] };

/** KPI метрики для страницы «Расписание» врача (9 плиток в KPI-строке, ТЗ §4.1). */
export type ScheduleKpis = {
  /** Неотменённые записи в периоде по start_at. */
  recordsInPeriod: number;
  /** Из записей в периоде: start_at < now(). */
  pastInPeriod: number;
  /** Из записей в периоде: start_at >= now(). */
  futureInPeriod: number;
  /** Неотменённые в периоде с package_usage_ref IS NOT NULL. */
  bySubscriptionInPeriod: number;
  /** Записи в периоде, у пациента которых НЕТ более ранней неотменённой записи. */
  firstVisitInPeriod: number;
  /** records − firstVisit. */
  repeatVisitInPeriod: number;
  /** COUNT(DISTINCT platformUserId) по записям в периоде. */
  uniquePatientsInPeriod: number;
  /** Отмены: записи с start_at в окне со статусом отмены (по дате визита §13.1). */
  cancellationsInPeriod: number;
  /** Переносы: записи с start_at в окне и rescheduleCount > 0 (по дате визита §13.1). */
  reschedulesInPeriod: number;
};

/** Запрос KPI по произвольному диапазону + опциональные фильтры. */
export type ScheduleKpisQuery = {
  /** ISO-строка начала диапазона (включительно, бизнес-таймзона). */
  from: string;
  /** ISO-строка конца диапазона (исключительно, бизнес-таймзона). */
  to: string;
  branchId?: string | null;
  serviceId?: string | null;
};

/** Одна точка в дневном ряду динамики записей. */
export type AppointmentDayPoint = {
  /** Дата в формате YYYY-MM-DD (бизнес-таймзона). */
  day: string;
  pastVisits: number;
  bookingsCreated: number;
  cancellationActions: number;
};

/** Статистика по филиалу за выбранный период. */
export type AppointmentBranchPoint = {
  /** Название филиала или «Без филиала» если null. */
  branchName: string;
  pastVisits: number;
  cancelledVisits: number;
};

export type DoctorAppointmentsPort = {
  listAppointmentsForSpecialist(
    filter: DoctorAppointmentsListFilter,
    audience?: DoctorAppointmentsAudience,
  ): Promise<AppointmentRow[]>;
  getAppointmentStats(
    filter: DoctorAppointmentStatsFilter,
    audience?: { excludedUserIds?: string[] },
  ): Promise<AppointmentStats>;
  /** Агрегаты для плиток дашборда; без React. */
  getDashboardAppointmentMetrics(audience?: { excludedUserIds?: string[] }): Promise<DoctorDashboardAppointmentMetrics>;
  /** KPI строка раздела «Расписание»: 9 метрик по произвольному диапазону + фильтры. */
  getScheduleKpis(
    query: ScheduleKpisQuery,
    audience?: DoctorAppointmentsAudience,
  ): Promise<ScheduleKpis>;
  /** Дневной ряд динамики записей + разбивка по филиалам за выбранный период. */
  getAppointmentDailySeries(
    filter: DoctorAppointmentStatsFilter,
    audience?: { excludedUserIds?: string[] },
  ): Promise<{ daySeries: AppointmentDayPoint[]; branchSeries: AppointmentBranchPoint[] }>;
};
