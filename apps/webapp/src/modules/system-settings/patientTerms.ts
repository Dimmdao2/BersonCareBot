/**
 * Резолвер терминологии пациентов из настройки `patient_label` (scope=doctor).
 *
 * `patient_label` — двоичный тумблер: `"клиент"` → «Клиенты», всё остальное → «Пациенты».
 * Резолвер — единственное место логики; всё остальное импортирует отсюда.
 *
 * Нормализация: trim + toLowerCase, чтобы «Клиент» или «КЛИЕНТ» работал так же, как «клиент».
 */

export type PatientTerms = {
  /** Именительный падеж мн.ч.: «Пациенты» или «Клиенты». */
  patientPluralLabel: string;
  /** Родительный падеж мн.ч.: «пациентов» или «клиентов». */
  patientGenPlural: string;
};

/**
 * Резолвит пару {именительный мн.ч., родительный мн.ч.} из значения настройки `patient_label`.
 *
 * @param singular — необработанное значение из БД (например «пациент», «клиент», «Клиент»).
 *                   Если не передано или `undefined/null`, используется дефолт «пациент».
 */
export function resolvePatientTerms(singular?: string | null): PatientTerms {
  const normalized = (singular ?? "пациент").trim().toLowerCase();
  if (normalized === "клиент") {
    return { patientPluralLabel: "Клиенты", patientGenPlural: "клиентов" };
  }
  return { patientPluralLabel: "Пациенты", patientGenPlural: "пациентов" };
}
