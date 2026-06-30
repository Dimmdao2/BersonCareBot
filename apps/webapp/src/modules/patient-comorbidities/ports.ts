/**
 * Patient Comorbidities module — ports (interfaces only; no DB/infra imports).
 *
 * Сопутствующие заболевания: список (текущие / снятые), добавление, редактирование
 * текста, снятие (soft-delete) и восстановление. Scoped по patientUserId.
 *
 * Жизненный цикл записи: active → removed (markRemoved) → active (restore).
 * Данные не удаляются физически — только меняется status.
 */

// -- Публичный тип записи (форма совпадает с mock Comorbidity в mockData.ts) ---

export type Comorbidity = {
  id: string;
  text: string;
  /** Человекочитаемая строка даты/периода (напр. «с 2017», «с рождения»). Может быть пустой. */
  since: string | null;
  status: "active" | "removed";
  createdAt: string;
  removedAt: string | null;
};

// -- Входы ------------------------------------------------------------------

export type AddComorbidityInput = {
  patientUserId: string;
  text: string;
  since?: string | null;
  createdBy: string;
};

export type EditComorbidityTextInput = {
  patientUserId: string;
  comorbidityId: string;
  /** If omitted, text is not changed. At least one of text/since must be provided. */
  text?: string;
  since?: string | null;
};

// -- Порт -------------------------------------------------------------------

export interface PatientComorbiditiesPort {
  /** Список записей по пациенту. status=all — все; иначе фильтр по статусу. */
  listByPatient(
    patientUserId: string,
    status: "active" | "removed" | "all",
  ): Promise<Comorbidity[]>;

  /** Добавить запись. Возвращает созданную запись. */
  add(input: AddComorbidityInput): Promise<Comorbidity>;

  /**
   * Редактировать текст и/или since записи. Хотя бы одно поле должно быть передано.
   * false — запись не найдена (неверный id или другой пациент).
   */
  editText(input: EditComorbidityTextInput): Promise<boolean>;

  /**
   * Пометить как «снятое» (status → removed, проставить removedAt).
   * false — запись не найдена или уже removed.
   */
  markRemoved(patientUserId: string, comorbidityId: string): Promise<boolean>;

  /**
   * Восстановить (status → active, очистить removedAt).
   * false — запись не найдена или уже active.
   */
  restore(patientUserId: string, comorbidityId: string): Promise<boolean>;
}
