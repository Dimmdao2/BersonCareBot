import type {
  TreatmentProgramTemplateUsageRef,
  TreatmentProgramTemplateUsageSnapshot,
} from '@/modules/treatment-program/types';
import { vNaForm } from '@/app/app/doctor/exercises/exerciseUsageSummaryText';
import { resolvePatientTerms } from '@/modules/system-settings/patientTerms';

export function treatmentProgramTemplateUsageHasAnyReference(
  u: TreatmentProgramTemplateUsageSnapshot,
): boolean {
  return (
    u.activeTreatmentProgramInstanceCount > 0 ||
    u.completedTreatmentProgramInstanceCount > 0 ||
    u.publishedCourseCount > 0 ||
    u.draftCourseCount > 0 ||
    u.archivedCourseCount > 0
  );
}

export type TreatmentProgramTemplateUsageSection = {
  key: string;
  summary: string;
  refs: TreatmentProgramTemplateUsageRef[];
  total: number;
};

export function treatmentProgramTemplateUsageSections(
  u: TreatmentProgramTemplateUsageSnapshot,
  patientGenPlural = resolvePatientTerms({ appointmentLabel: undefined }).patientGenPlural,
): TreatmentProgramTemplateUsageSection[] {
  const sections: TreatmentProgramTemplateUsageSection[] = [];
  if (u.activeTreatmentProgramInstanceCount > 0) {
    sections.push({
      key: 'active_inst',
      summary: vNaForm(
        u.activeTreatmentProgramInstanceCount,
        `активной программе у ${patientGenPlural}`,
        `активных программах у ${patientGenPlural}`,
        `активных программах у ${patientGenPlural}`,
      ),
      refs: u.activeTreatmentProgramInstanceRefs,
      total: u.activeTreatmentProgramInstanceCount,
    });
  }
  if (u.completedTreatmentProgramInstanceCount > 0) {
    sections.push({
      key: 'completed_inst',
      summary: vNaForm(
        u.completedTreatmentProgramInstanceCount,
        `завершённой программе у ${patientGenPlural} (история)`,
        `завершённых программах у ${patientGenPlural} (история)`,
        `завершённых программах у ${patientGenPlural} (история)`,
      ),
      refs: u.completedTreatmentProgramInstanceRefs,
      total: u.completedTreatmentProgramInstanceCount,
    });
  }
  if (u.publishedCourseCount > 0) {
    sections.push({
      key: 'pub_course',
      summary: vNaForm(
        u.publishedCourseCount,
        'опубликованном курсе, привязанном к шаблону',
        'опубликованных курсах, привязанных к шаблону',
        'опубликованных курсах, привязанных к шаблону',
      ),
      refs: u.publishedCourseRefs,
      total: u.publishedCourseCount,
    });
  }
  if (u.draftCourseCount > 0) {
    sections.push({
      key: 'draft_course',
      summary: vNaForm(
        u.draftCourseCount,
        'черновом курсе с этим шаблоном',
        'черновых курсах с этим шаблоном',
        'черновых курсах с этим шаблоном',
      ),
      refs: u.draftCourseRefs,
      total: u.draftCourseCount,
    });
  }
  if (u.archivedCourseCount > 0) {
    sections.push({
      key: 'arch_course',
      summary: vNaForm(
        u.archivedCourseCount,
        'архивном курсе с этим шаблоном (история)',
        'архивных курсах с этим шаблоном (история)',
        'архивных курсах с этим шаблоном (история)',
      ),
      refs: u.archivedCourseRefs,
      total: u.archivedCourseCount,
    });
  }
  return sections;
}
