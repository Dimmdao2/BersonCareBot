/**
 * Вид оценки клинического теста (каталог): фиксированный enum v1 — см. PRE_IMPLEMENTATION_DECISIONS / ТЗ B2 (Q1).
 * Расширение списка — решение врача/продукта, затем правка этого модуля.
 */
export const CLINICAL_ASSESSMENT_KIND_OPTIONS = [
  { value: "mobility", label: "Подвижность" },
  { value: "pain", label: "Болезненность" },
  { value: "sensitivity", label: "Чувствительность" },
  { value: "strength", label: "Сила" },
  { value: "neurodynamics", label: "Нейродинамика" },
  { value: "proprioception", label: "Проприоцепция" },
  { value: "balance", label: "Равновесие" },
  { value: "endurance", label: "Выносливость" },
] as const;

export type ClinicalAssessmentKind = (typeof CLINICAL_ASSESSMENT_KIND_OPTIONS)[number]["value"];

const KIND_SET = new Set<string>(CLINICAL_ASSESSMENT_KIND_OPTIONS.map((o) => o.value));

export function isClinicalAssessmentKind(code: string | null | undefined): code is ClinicalAssessmentKind {
  return typeof code === "string" && KIND_SET.has(code);
}

export function clinicalAssessmentKindLabel(code: ClinicalAssessmentKind | null | undefined): string {
  if (!code) return "";
  const hit = CLINICAL_ASSESSMENT_KIND_OPTIONS.find((o) => o.value === code);
  return hit?.label ?? code;
}
