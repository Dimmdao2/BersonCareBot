/**
 * Patient Clinical Core module — ports (interfaces only; no DB/infra imports).
 *
 * Источник правды для раздела «Карта» кабинета врача: визиты (первичный/повторный),
 * жалобы + их severity-обновления (per visit), диагнозы + уточнения, собственный
 * справочник диагнозов. Файлы линкуются к визиту через patient_files.visit_id
 * (см. модуль patient-files — единый источник файлов).
 *
 * Запись — только через createVisit («Новый визит»). Чтение — getClinicalState
 * (проекция «актуальное состояние») + listVisits (история).
 */

// -- Проекция «актуальное состояние» -----------------------------------------

/** Активная жалоба с текущей severity и трендом (старые→новые). */
export type ActiveComplaint = {
  id: string;
  text: string;
  priority: boolean;
  /** severity последнего обновления (0–10). */
  currentSeverity: number;
  /** severity всех обновлений в хронологическом порядке (старые→новые). */
  trend: number[];
  /** Человекочитаемая дата постановки, напр. «с 05.01». */
  since: string;
};

/** Активный (не снятый) диагноз. */
export type ActiveDiagnosis = {
  id: string;
  text: string;
  priority: boolean;
  status: "active" | "refined";
  /** Человекочитаемая мета, напр. «уточнён 22.01» / «поставлен 05.01». */
  meta: string;
};

export type ClinicalState = {
  complaints: ActiveComplaint[];
  diagnoses: ActiveDiagnosis[];
};

// -- История визитов (форма зеркалит UI VisitCard / mockData.ts Visit) ---------

export type VisitDynamicsRow = {
  id: string;
  priority: boolean;
  label: string;
  from: number;
  to: number;
  note: string;
};

export type VisitSection = {
  title: string;
  body: string;
};

export type VisitFile = {
  id: string;
  /** Эмодзи-иконка по типу файла (📷/📄/…). */
  icon: string;
  name: string;
};

export type Visit = {
  id: string;
  /** Человекочитаемая дата, напр. «22 января 2026». */
  date: string;
  type: "first" | "repeat";
  location: string;
  duration: string;
  filesCount?: number;
  /** Для повторных визитов: динамика жалоб (from→to severity). */
  dynamics?: VisitDynamicsRow[];
  /** Текстовые разделы (Осмотр / Манипуляции / Рекомендации / …). */
  sections?: VisitSection[];
  files?: VisitFile[];
};

// -- Справочник диагнозов -----------------------------------------------------

export type DiagnosisCatalogSuggestion = {
  id: string;
  label: string;
  note: string | null;
};

export type CreateDiagnosisCatalogParams = {
  label: string;
  note?: string | null;
  createdBy: string;
};

// -- Вход createVisit ---------------------------------------------------------

export type CreateVisitComplaint = {
  text: string;
  priority: boolean;
  severity: number; // 0–10
};

export type CreateVisitDiagnosis = {
  text: string;
  priority: boolean;
  catalogId?: string | null;
};

export type CreateVisitComplaintUpdate = {
  complaintId: string;
  note: string;
  severity: number; // 0–10
  resolved: boolean;
};

export type CreateVisitDiagnosisUpdate = {
  diagnosisId: string;
  refinement?: string | null;
  removed: boolean;
};

export type CreateVisitInput = {
  patientUserId: string;
  visitType: "first" | "repeat";
  /** ISO-строка момента визита. */
  visitedAt: string;
  location?: string | null;
  service?: string | null;
  duration?: string | null;
  appointmentRecordId?: string | null;
  exam?: string | null;
  manipulations?: string | null;
  trialResults?: string | null;
  recommendations?: string | null;
  createdBy: string;
  /** Первичный визит: новые жалобы (+ первое обновление с severity). */
  complaints?: CreateVisitComplaint[];
  /** Первичный визит: новые диагнозы. */
  diagnoses?: CreateVisitDiagnosis[];
  /** Повторный визит: обновления severity по активным жалобам. */
  complaintUpdates?: CreateVisitComplaintUpdate[];
  /** Повторный визит: уточнения/снятие диагнозов. */
  diagnosisUpdates?: CreateVisitDiagnosisUpdate[];
};

export interface PatientClinicalPort {
  /** Проекция «актуальное состояние» — активные жалобы (с severity+тренд) и диагнозы. */
  getClinicalState(patientUserId: string): Promise<ClinicalState>;
  /** История визитов (новые→старые), с динамикой/разделами/файлами. */
  listVisits(patientUserId: string): Promise<Visit[]>;
  /** Autocomplete по собственному справочнику диагнозов. */
  searchDiagnosisCatalog(query: string): Promise<DiagnosisCatalogSuggestion[]>;
  /** Создать запись в справочнике диагнозов. */
  createDiagnosisCatalogEntry(
    params: CreateDiagnosisCatalogParams,
  ): Promise<DiagnosisCatalogSuggestion>;
  /** Создать визит транзакционно (см. CreateVisitInput). Возвращает id визита. */
  createVisit(input: CreateVisitInput): Promise<string>;
}
