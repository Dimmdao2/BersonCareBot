import type { ClinicalTestUsageRef, ClinicalTestUsageSnapshot } from '@/modules/tests/types';
import type { PatientTerms } from '@/modules/system-settings/patientTerms';
import { vNaForm } from '@/app/app/doctor/exercises/exerciseUsageSummaryText';

export function clinicalTestUsageHasAnyReference(u: ClinicalTestUsageSnapshot): boolean {
  return (
    u.nonArchivedTestSetsContainingCount > 0 ||
    u.archivedTestSetsContainingCount > 0 ||
    u.publishedTreatmentProgramTemplateCount > 0 ||
    u.draftTreatmentProgramTemplateCount > 0 ||
    u.archivedTreatmentProgramTemplateCount > 0 ||
    u.activeTreatmentProgramInstanceCount > 0 ||
    u.completedTreatmentProgramInstanceCount > 0 ||
    u.testResultsRecordedCount > 0
  );
}

export type ClinicalTestUsageSection = {
  key: string;
  summary: string;
  refs: ClinicalTestUsageRef[];
  total: number;
};

export function clinicalTestUsageSections(
  u: ClinicalTestUsageSnapshot,
  terms: Pick<PatientTerms, 'patientGenPlural'>,
): ClinicalTestUsageSection[] {
  const sections: ClinicalTestUsageSection[] = [];
  if (u.nonArchivedTestSetsContainingCount > 0) {
    sections.push({
      key: 'active_test_sets',
      summary: vNaForm(
        u.nonArchivedTestSetsContainingCount,
        'активном наборе тестов',
        'активных наборах тестов',
        'активных наборах тестов',
      ),
      refs: u.nonArchivedTestSetRefs,
      total: u.nonArchivedTestSetsContainingCount,
    });
  }
  if (u.archivedTestSetsContainingCount > 0) {
    sections.push({
      key: 'archived_test_sets',
      summary: vNaForm(
        u.archivedTestSetsContainingCount,
        'архивном наборе тестов (история)',
        'архивных наборах тестов (история)',
        'архивных наборах тестов (история)',
      ),
      refs: u.archivedTestSetRefs,
      total: u.archivedTestSetsContainingCount,
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
  if (u.archivedTreatmentProgramTemplateCount > 0) {
    sections.push({
      key: 'archived_tp_tpl',
      summary: vNaForm(
        u.archivedTreatmentProgramTemplateCount,
        'архивном шаблоне программ лечения (история)',
        'архивных шаблонах программ лечения (история)',
        'архивных шаблонах программ лечения (история)',
      ),
      refs: u.archivedTreatmentProgramTemplateRefs,
      total: u.archivedTreatmentProgramTemplateCount,
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
  if (u.testResultsRecordedCount > 0) {
    sections.push({
      key: 'test_results_history',
      summary: `Зафиксировано результатов прохождения этого теста: ${u.testResultsRecordedCount}`,
      refs: [],
      total: u.testResultsRecordedCount,
    });
  }
  return sections;
}
