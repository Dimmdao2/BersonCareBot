import type { ExerciseUsageRef, ExerciseUsageSnapshot } from '@/modules/lfk-exercises/types';

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
  return (
    u.publishedLfkComplexTemplateCount > 0 ||
    u.draftLfkComplexTemplateCount > 0 ||
    u.activePatientLfkAssignmentCount > 0 ||
    u.publishedTreatmentProgramTemplateCount > 0 ||
    u.draftTreatmentProgramTemplateCount > 0 ||
    u.activeTreatmentProgramInstanceCount > 0 ||
    u.completedTreatmentProgramInstanceCount > 0
  );
}

export type ExerciseUsageSection = {
  key: string;
  summary: string;
  refs: ExerciseUsageRef[];
  total: number;
};

/** Секции для UI: сводная строка + ограниченный список ссылок. */
export function exerciseUsageSections(u: ExerciseUsageSnapshot): ExerciseUsageSection[] {
  const sections: ExerciseUsageSection[] = [];
  if (u.publishedLfkComplexTemplateCount > 0) {
    sections.push({
      key: 'published_lfk',
      summary: vNaForm(
        u.publishedLfkComplexTemplateCount,
        'опубликованном шаблоне комплексов ЛФК',
        'опубликованных шаблонах комплексов ЛФК',
        'опубликованных шаблонах комплексов ЛФК',
      ),
      refs: u.publishedLfkComplexTemplateRefs,
      total: u.publishedLfkComplexTemplateCount,
    });
  }
  if (u.draftLfkComplexTemplateCount > 0) {
    sections.push({
      key: 'draft_lfk',
      summary: vNaForm(
        u.draftLfkComplexTemplateCount,
        'черновом шаблоне комплексов ЛФК',
        'черновых шаблонах комплексов ЛФК',
        'черновых шаблонах комплексов ЛФК',
      ),
      refs: u.draftLfkComplexTemplateRefs,
      total: u.draftLfkComplexTemplateCount,
    });
  }
  if (u.publishedTreatmentProgramTemplateCount > 0) {
    sections.push({
      key: 'published_tp_tpl',
      summary: vNaForm(
        u.publishedTreatmentProgramTemplateCount,
        'опубликованном шаблоне программ лечения',
        'опубликованных шаблонах программ лечения',
        'опубликованных шаблонах программ лечения',
      ),
      refs: u.publishedTreatmentProgramTemplateRefs,
      total: u.publishedTreatmentProgramTemplateCount,
    });
  }
  if (u.draftTreatmentProgramTemplateCount > 0) {
    sections.push({
      key: 'draft_tp_tpl',
      summary: vNaForm(
        u.draftTreatmentProgramTemplateCount,
        'черновом шаблоне программ лечения',
        'черновых шаблонах программ лечения',
        'черновых шаблонах программ лечения',
      ),
      refs: u.draftTreatmentProgramTemplateRefs,
      total: u.draftTreatmentProgramTemplateCount,
    });
  }
  if (u.activeTreatmentProgramInstanceCount > 0) {
    sections.push({
      key: 'active_tp_inst',
      summary: vNaForm(
        u.activeTreatmentProgramInstanceCount,
        'активной программе у пациентов',
        'активных программах у пациентов',
        'активных программах у пациентов',
      ),
      refs: u.activeTreatmentProgramInstanceRefs,
      total: u.activeTreatmentProgramInstanceCount,
    });
  }
  if (u.activePatientLfkAssignmentCount > 0) {
    sections.push({
      key: 'active_pla',
      summary: vNaForm(
        u.activePatientLfkAssignmentCount,
        'активном назначении ЛФК у пациентов',
        'активных назначениях ЛФК у пациентов',
        'активных назначениях ЛФК у пациентов',
      ),
      refs: u.activePatientLfkAssignmentRefs,
      total: u.activePatientLfkAssignmentCount,
    });
  }
  if (u.completedTreatmentProgramInstanceCount > 0) {
    sections.push({
      key: 'completed_tp_inst',
      summary: vNaForm(
        u.completedTreatmentProgramInstanceCount,
        'завершённой программе у пациентов (история)',
        'завершённых программах у пациентов (история)',
        'завершённых программах у пациентов (история)',
      ),
      refs: u.completedTreatmentProgramInstanceRefs,
      total: u.completedTreatmentProgramInstanceCount,
    });
  }
  return sections;
}

/** Короткие строки для блока «Где используется» (только сводка, без списка ссылок). */
export function exerciseUsageSummaryLines(u: ExerciseUsageSnapshot): string[] {
  return exerciseUsageSections(u).map((s) => s.summary);
}
