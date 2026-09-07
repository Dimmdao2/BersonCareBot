import type {
  RecommendationUsageRef,
  RecommendationUsageSnapshot,
} from '@/modules/recommendations/types';
import type { PatientTerms } from '@/modules/system-settings/patientTerms';
import { vNaForm } from '@/app/app/doctor/exercises/exerciseUsageSummaryText';

export function recommendationUsageHasAnyReference(u: RecommendationUsageSnapshot): boolean {
  return (
    u.publishedTreatmentProgramTemplateCount > 0 ||
    u.draftTreatmentProgramTemplateCount > 0 ||
    u.archivedTreatmentProgramTemplateCount > 0 ||
    u.activeTreatmentProgramInstanceCount > 0 ||
    u.completedTreatmentProgramInstanceCount > 0
  );
}

export type RecommendationUsageSection = {
  key: string;
  summary: string;
  refs: RecommendationUsageRef[];
  total: number;
};

export function recommendationUsageSections(
  u: RecommendationUsageSnapshot,
  terms: Pick<PatientTerms, 'patientGenPlural'>,
): RecommendationUsageSection[] {
  const sections: RecommendationUsageSection[] = [];
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
  return sections;
}
