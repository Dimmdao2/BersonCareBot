import type { ExerciseUsageSnapshot } from "@/modules/lfk-exercises/types";

/** «В N + одна/несколько/много» для существительного после числа (род. мн. / предл. мн.). */
export function vNaForm(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  let w: string;
  if (mod10 === 1 && mod100 !== 11) w = one;
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) w = few;
  else w = many;
  return `В ${n} ${w}`;
}

export function exerciseUsageHasAnyReference(u: ExerciseUsageSnapshot): boolean {
  return Object.values(u).some((n) => n > 0);
}

/** Короткие строки для блока «Где используется». */
export function exerciseUsageSummaryLines(u: ExerciseUsageSnapshot): string[] {
  const lines: string[] = [];
  if (u.publishedLfkComplexTemplateCount > 0) {
    lines.push(
      vNaForm(
        u.publishedLfkComplexTemplateCount,
        "опубликованном шаблоне комплексов ЛФК",
        "опубликованных шаблонах комплексов ЛФК",
        "опубликованных шаблонах комплексов ЛФК",
      ),
    );
  }
  if (u.draftLfkComplexTemplateCount > 0) {
    lines.push(
      vNaForm(
        u.draftLfkComplexTemplateCount,
        "черновом шаблоне комплексов ЛФК",
        "черновых шаблонах комплексов ЛФК",
        "черновых шаблонах комплексов ЛФК",
      ),
    );
  }
  if (u.publishedTreatmentProgramTemplateCount > 0) {
    lines.push(
      vNaForm(
        u.publishedTreatmentProgramTemplateCount,
        "опубликованном шаблоне программ лечения",
        "опубликованных шаблонах программ лечения",
        "опубликованных шаблонах программ лечения",
      ),
    );
  }
  if (u.draftTreatmentProgramTemplateCount > 0) {
    lines.push(
      vNaForm(
        u.draftTreatmentProgramTemplateCount,
        "черновом шаблоне программ лечения",
        "черновых шаблонах программ лечения",
        "черновых шаблонах программ лечения",
      ),
    );
  }
  if (u.activeTreatmentProgramInstanceCount > 0) {
    lines.push(
      vNaForm(
        u.activeTreatmentProgramInstanceCount,
        "активной программе у пациентов",
        "активных программах у пациентов",
        "активных программах у пациентов",
      ),
    );
  }
  if (u.activePatientLfkAssignmentCount > 0) {
    lines.push(
      vNaForm(
        u.activePatientLfkAssignmentCount,
        "активном назначении ЛФК у пациентов",
        "активных назначениях ЛФК у пациентов",
        "активных назначениях ЛФК у пациентов",
      ),
    );
  }
  if (u.completedTreatmentProgramInstanceCount > 0) {
    lines.push(
      vNaForm(
        u.completedTreatmentProgramInstanceCount,
        "завершённой программе у пациентов (история)",
        "завершённых программах у пациентов (история)",
        "завершённых программах у пациентов (история)",
      ),
    );
  }
  return lines;
}
