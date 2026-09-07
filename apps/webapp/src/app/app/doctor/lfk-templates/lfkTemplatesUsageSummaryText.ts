import type { LfkTemplateUsageRef, LfkTemplateUsageSnapshot } from '@/modules/lfk-templates/types';
import type { PatientTerms } from '@/modules/system-settings/patientTerms';
import { vNaForm } from '@/app/app/doctor/exercises/exerciseUsageSummaryText';

export function lfkTemplateUsageHasAnyReference(u: LfkTemplateUsageSnapshot): boolean {
  return (
    u.activePatientLfkAssignmentCount > 0 ||
    u.publishedTreatmentProgramTemplateCount > 0 ||
    u.draftTreatmentProgramTemplateCount > 0 ||
    u.activeTreatmentProgramInstanceCount > 0 ||
    u.completedTreatmentProgramInstanceCount > 0
  );
}

export type LfkTemplateUsageSection = {
  key: string;
  summary: string;
  refs: LfkTemplateUsageRef[];
  total: number;
};

export function lfkTemplateUsageSections(
  u: LfkTemplateUsageSnapshot,
  terms: Pick<PatientTerms, 'patientGenPlural'>,
): LfkTemplateUsageSection[] {
  const sections: LfkTemplateUsageSection[] = [];
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
        `активной программе у ${terms.patientGenPlural}`,
        `активных программах у ${terms.patientGenPlural}`,
        `активных программах у ${terms.patientGenPlural}`,
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
        `активном назначении ЛФК у ${terms.patientGenPlural}`,
        `активных назначениях ЛФК у ${terms.patientGenPlural}`,
        `активных назначениях ЛФК у ${terms.patientGenPlural}`,
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
        `завершённой программе у ${terms.patientGenPlural} (история)`,
        `завершённых программах у ${terms.patientGenPlural} (история)`,
        `завершённых программах у ${terms.patientGenPlural} (история)`,
      ),
      refs: u.completedTreatmentProgramInstanceRefs,
      total: u.completedTreatmentProgramInstanceCount,
    });
  }
  return sections;
}
