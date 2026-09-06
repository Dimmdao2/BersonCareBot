/**
 * Patient Clinical Core module — ports (interfaces only; no DB/infra imports).
 *
 * Источник правды для раздела «Карта» кабинета врача: визиты (первичный/повторный),
 * жалобы + их severity-обновления (per visit), диагнозы + уточнения, собственный
 * справочник диагнозов. Файлы линкуются к визиту через patient_files.visit_id
 * (см. модуль patient-files — единый источник файлов).
 *
 * Запись симптомов и диагнозов возможна как из визита, так и напрямую из карты пациента.
 * Чтение — getClinicalState (актуальное + закрытое) и listVisits (история визитов).
 */

// -- Проекция «актуальное состояние» -----------------------------------------

/** Активная жалоба с текущей severity и трендом (старые→новые). */
export type ActiveComplaint = {
  id: string;
  text: string;
  description: string | null;
  priority: boolean;
  /** severity последнего обновления (0–10). */
  currentSeverity: number;
  /** severity всех обновлений в хронологическом порядке (старые→новые). */
  trend: number[];
  /** Человекочитаемая дата постановки, напр. «с 05.01». */
  since: string;
  createdAt: string;
  resolvedAt: string | null;
  history: ComplaintHistoryEntry[];
};

export type ComplaintHistoryEntry = {
  id: string;
  severity: number;
  note: string | null;
  recordedAt: string;
  resolved: boolean;
};

/**
 * Врачебный клинический статус диагноза.
 * Независим от visit-based lifecycle (active/refined/resolved).
 */
export type DiagnosisClinicalStatus = 'предварительный' | 'подтверждённый' | 'закрытый';

export const DIAGNOSIS_CLINICAL_STATUS_VALUES: DiagnosisClinicalStatus[] = [
  'предварительный',
  'подтверждённый',
  'закрытый',
];

/** Запись в истории изменений клинического статуса. */
export type DiagnosisStatusHistoryEntry = {
  id: string;
  oldStatus: string | null;
  newStatus: string;
  changedAt: string;
  /** null если пользователь удалён. */
  changedByName: string | null;
  note: string | null;
};

/** Диагноз в актуальной или исторической проекции. */
export type ActiveDiagnosis = {
  id: string;
  text: string;
  priority: boolean;
  status: 'active' | 'refined' | 'resolved';
  /** Врачебный клинический статус. */
  clinicalStatus: DiagnosisClinicalStatus;
  /** Человекочитаемая мета, напр. «уточнён 22.01» / «поставлен 05.01». */
  meta: string;
  comment: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type ClinicalState = {
  complaints: ActiveComplaint[];
  complaintHistory: ActiveComplaint[];
  diagnoses: ActiveDiagnosis[];
  diagnosisHistory: ActiveDiagnosis[];
};

export type CreateComplaintInput = {
  patientUserId: string;
  text: string;
  description?: string | null;
  priority: boolean;
  severity: number;
};

export type AppendComplaintUpdateInput = {
  patientUserId: string;
  complaintId: string;
  severity: number;
  note?: string | null;
  resolved: boolean;
};

export type CreateDiagnosisInput = {
  patientUserId: string;
  text: string;
  priority: boolean;
  comment?: string | null;
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
  /** Canonical appointment whose prepared clinical note this visit represents. */
  canonicalAppointmentId?: string | null;
  /** Человекочитаемая дата, напр. «22 января 2026». */
  date: string;
  /** Человекочитаемое время визита, напр. «14:30». */
  time: string;
  type: 'first' | 'repeat';
  location: string;
  duration: string;
  anamnesisText: string | null;
  filesCount?: number;
  /** Для повторных визитов: динамика жалоб (from→to severity). */
  dynamics?: VisitDynamicsRow[];
  /** Текстовые разделы (Осмотр / Манипуляции / Рекомендации / …). */
  sections?: VisitSection[];
  files?: VisitFile[];
  /** Если визит был списан с абонемента — данные абонемента, иначе null. */
  package?: { title: string; displayNumber: number | null } | null;
  /**
   * Сырые редактируемые поля визита (страница приёма, ENCOUNTER-PAGE-04/05). `sections`
   * выше остаётся общим read-only представлением для компактного просмотра; `raw` — тот же
   * набор полей `clinical_visit`, не склеенных в текст, для формы правки полноценной страницы.
   */
  raw?: {
    /** ISO-строка момента визита (для date/time picker'ов формы правки). */
    visitedAtIso: string;
    service: string | null;
    exam: string | null;
    manipulations: string | null;
    trialResults: string | null;
    recommendations: string | null;
  };
};

// -- Анамнез ------------------------------------------------------------------

/**
 * Запись в секции «Травмы и операции».
 * Биографическая запись, не привязана к визиту; допускает исправление без удаления.
 */
export type AnamnesisTraumaEntry = {
  id: string;
  year: string;
  what: string;
  type: string;
  immobilization: string;
};

/**
 * Запись в секции «Болезни, стрессы».
 */
export type AnamnesisIllnessEntry = {
  id: string;
  period: string;
  what: string;
  comment: string;
};

/**
 * Запись в секции «Образ жизни».
 * date — отформатированная дата для отображения (ДД.ММ.ГГГГ).
 */
export type AnamnesisLifestyleEntry = {
  id: string;
  date: string;
  text: string;
};

export type AnamnesisState = {
  trauma: AnamnesisTraumaEntry[];
  illness: AnamnesisIllnessEntry[];
  lifestyle: AnamnesisLifestyleEntry[];
  /**
   * «Анамнез заболевания» — единый patient-scoped текст (не append-log, в отличие от секций
   * выше), '' если не заполнен. Optional keeps older call sites that build an `AnamnesisState`
   * literal without this field compiling; readers treat a missing field as ''.
   */
  disease?: string;
};

// -- Входы добавления и исправления анамнеза ---------------------------------

export type AppendAnamnesisTraumaInput = {
  patientUserId: string;
  year: string;
  what: string;
  type: string;
  immobilization: string;
  createdBy: string;
};

export type AppendAnamnesisIllnessInput = {
  patientUserId: string;
  period: string;
  what: string;
  comment: string;
  createdBy: string;
};

export type AppendAnamnesisLifestyleInput = {
  patientUserId: string;
  /** ISO date string of the record date, e.g. "2026-01-18". */
  recordDate: string;
  text: string;
  createdBy: string;
};

/** Заменить единый текст «Анамнез заболевания» целиком (upsert, не append). */
export type SetAnamnesisDiseaseInput = {
  patientUserId: string;
  text: string;
  createdBy: string;
};

export type UpdateAnamnesisEntryInput =
  | {
      section: 'trauma';
      patientUserId: string;
      entryId: string;
      year: string;
      what: string;
      type: string;
      immobilization: string;
    }
  | {
      section: 'illness';
      patientUserId: string;
      entryId: string;
      period: string;
      what: string;
      comment: string;
    }
  | {
      section: 'lifestyle';
      patientUserId: string;
      entryId: string;
      recordDate: string;
      text: string;
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
  description?: string | null;
  priority: boolean;
  severity: number; // 0–10
};

export type CreateVisitDiagnosis = {
  text: string;
  priority: boolean;
  catalogId?: string | null;
  comment?: string | null;
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
  visitType: 'first' | 'repeat';
  /** ISO-строка момента визита. */
  visitedAt: string;
  location?: string | null;
  service?: string | null;
  duration?: string | null;
  anamnesisText?: string | null;
  canonicalAppointmentId?: string | null;
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

// -- Инлайн-правка полей (коррекция данных, не клинические статус-изменения) ---

/**
 * Правка атрибутов жалобы (исправление опечатки / переключение приоритета).
 * Статус меняется отдельным appendComplaintUpdate. Поля опциональны:
 * передаётся только то, что меняем.
 */
export type UpdateComplaintFieldsInput = {
  patientUserId: string;
  complaintId: string;
  text?: string;
  description?: string | null;
  priority?: boolean;
};

/** Правка атрибутов диагноза. Клинический статус меняется отдельной командой. */
export type UpdateDiagnosisFieldsInput = {
  patientUserId: string;
  diagnosisId: string;
  text?: string;
  priority?: boolean;
  comment?: string | null;
};

/** Установить клинический статус диагноза + записать в историю. */
export type SetDiagnosisClinicalStatusInput = {
  patientUserId: string;
  diagnosisId: string;
  newStatus: DiagnosisClinicalStatus;
  changedBy: string;
  note?: string | null;
};

/**
 * Правка текстовых полей визита (осмотр/манипуляции/пробы/рекомендации/локация/длительность).
 * Пустая строка очищает поле (→ null). Не трогает жалобы/диагнозы/динамику визита.
 */
export type UpdateVisitFieldsInput = {
  patientUserId: string;
  visitId: string;
  location?: string | null;
  duration?: string | null;
  anamnesisText?: string | null;
  exam?: string | null;
  manipulations?: string | null;
  trialResults?: string | null;
  recommendations?: string | null;
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
  createComplaint(input: CreateComplaintInput): Promise<string>;
  appendComplaintUpdate(input: AppendComplaintUpdateInput): Promise<boolean>;
  createDiagnosis(input: CreateDiagnosisInput): Promise<string>;

  // -- Инлайн-правка полей (scoped по patientUserId; false — запись не найдена) --

  /** Поправить text/priority жалобы. */
  updateComplaintFields(input: UpdateComplaintFieldsInput): Promise<boolean>;
  /** Поправить text/priority диагноза. */
  updateDiagnosisFields(input: UpdateDiagnosisFieldsInput): Promise<boolean>;
  /** Поправить текстовые поля визита. */
  updateVisitFields(input: UpdateVisitFieldsInput): Promise<boolean>;

  // -- Клинический статус диагноза -----------------------------------------

  /**
   * Установить клинический статус диагноза.
   * Обновляет clinical_diagnosis.clinical_status + пишет строку в history.
   * Возвращает false если диагноз не найден для данного пациента.
   */
  setDiagnosisClinicalStatus(input: SetDiagnosisClinicalStatusInput): Promise<boolean>;

  /** История изменений клинического статуса (старые→новые). */
  getDiagnosisStatusHistory(
    patientUserId: string,
    diagnosisId: string,
  ): Promise<DiagnosisStatusHistoryEntry[]>;

  // -- Анамнез (append-log, не per-visit) -----------------------------------

  /** Проекция анамнеза: все три секции, хронологически (старые→новые). */
  getAnamnesis(patientUserId: string): Promise<AnamnesisState>;
  /** Добавить запись в секцию «Травмы и операции». */
  appendAnamnesisTrauma(input: AppendAnamnesisTraumaInput): Promise<AnamnesisTraumaEntry>;
  /** Добавить запись в секцию «Болезни, стрессы». */
  appendAnamnesisIllness(input: AppendAnamnesisIllnessInput): Promise<AnamnesisIllnessEntry>;
  /** Добавить запись в секцию «Образ жизни». */
  appendAnamnesisLifestyle(input: AppendAnamnesisLifestyleInput): Promise<AnamnesisLifestyleEntry>;
  /** Исправить существующую биографическую запись; записи анамнеза не удаляются. */
  updateAnamnesisEntry(input: UpdateAnamnesisEntryInput): Promise<boolean>;
  /** Заменить единый текст «Анамнез заболевания» целиком. Возвращает сохранённый текст. */
  setAnamnesisDisease(input: SetAnamnesisDiseaseInput): Promise<string>;

  /**
   * Список канонических appointment id, уже привязанных к визитам пациента.
   * Используется в «Создать из записи», чтобы отфильтровать уже использованные записи.
   */
  listLinkedAppointmentIds(patientUserId: string): Promise<string[]>;
}
