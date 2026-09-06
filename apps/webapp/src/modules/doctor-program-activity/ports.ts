import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';

/**
 * Doctor-scoped rollup of ACTUAL treatment-program execution (`program_action_log`, action
 * `'done'`) across the specialist's visible patients — AN-ACT §D of
 * `docs/_TODO/DOCTOR_ANALYTICS_REBUILD_2026-09-06.md`.
 *
 * Per-patient/per-instance building blocks already exist on `ProgramActionLogPort`
 * (`modules/treatment-program/ports.ts`); none of them span more than one patient. This port adds
 * exactly the cross-patient aggregate the brief calls out as missing — organization + visibility
 * actor are mandatory inputs, mirroring `DoctorAppointmentsAudience`/`DoctorClientsFilters`, not a
 * new scoping model.
 */
export type DoctorProgramActivityAudience = {
  organizationId: string;
  visibilityActor: PatientVisibilityActor;
  excludedUserIds?: string[];
};

/** `[from, to)` — business-timezone bounds, same contract as `DoctorAppointmentStatsFilter` bounds. */
export type DoctorProgramActivityPeriod = {
  from: string;
  toExclusive: string;
  fromDay: string;
  toDay: string;
  displayIana: string;
};

export type DoctorProgramActivityKpis = {
  /** Видимые специалисту пациенты с активной (`status = 'active'`) назначенной программой. */
  patientsWithActiveProgram: number;
  /** Из них: у кого есть хотя бы одна отметка `done` за период. */
  patientsWithActivityInPeriod: number;
  /** Всего отметок `done` за период (упражнения/рекомендации/уроки/тесты). */
  doneCountInPeriod: number;
  /** Календарных дней (бизнес-таймзона) с хотя бы одной отметкой у видимой когорты. */
  daysWithActivityInPeriod: number;
  /** `patientsWithActivityInPeriod / patientsWithActiveProgram`; 0, если знаменатель — 0. */
  activePatientShare: number;
};

export type ProgramActivityDayPoint = {
  /** YYYY-MM-DD, бизнес-таймзона. */
  day: string;
  doneCount: number;
  /** COUNT(DISTINCT patient_user_id) в этот день. */
  activePatientsCount: number;
};

export type ProgramActivityPatientRow = {
  patientUserId: string;
  displayName: string;
  doneCountInPeriod: number;
  lastDoneAtIso: string;
};

export type DoctorProgramActivityPort = {
  getActivityKpis(
    period: DoctorProgramActivityPeriod,
    audience: DoctorProgramActivityAudience,
  ): Promise<DoctorProgramActivityKpis>;
  getActivityDailySeries(
    period: DoctorProgramActivityPeriod,
    audience: DoctorProgramActivityAudience,
  ): Promise<ProgramActivityDayPoint[]>;
  /** Drill-down: пациенты с активностью за период, для перехода в карточку/календарь упражнений. */
  listPatientsWithActivity(
    period: DoctorProgramActivityPeriod,
    audience: DoctorProgramActivityAudience,
    limit: number,
    offset: number,
  ): Promise<{ items: ProgramActivityPatientRow[]; hasMore: boolean }>;
};
