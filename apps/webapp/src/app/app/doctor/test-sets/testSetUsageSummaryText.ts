import type { TestSetUsageRef, TestSetUsageSnapshot } from "@/modules/tests/types";
import { vNaForm } from "@/app/app/doctor/exercises/exerciseUsageSummaryText";

export function testSetUsageHasAnyReference(u: TestSetUsageSnapshot): boolean {
  return (
    u.publishedTreatmentProgramTemplateCount > 0 ||
    u.draftTreatmentProgramTemplateCount > 0 ||
    u.archivedTreatmentProgramTemplateCount > 0 ||
    u.activeTreatmentProgramInstanceCount > 0 ||
    u.completedTreatmentProgramInstanceCount > 0 ||
    u.testAttemptsRecordedCount > 0
  );
}

export type TestSetUsageSection = {
  key: string;
  summary: string;
  refs: TestSetUsageRef[];
  total: number;
};

export function testSetUsageSections(u: TestSetUsageSnapshot): TestSetUsageSection[] {
  const sections: TestSetUsageSection[] = [];
  if (u.publishedTreatmentProgramTemplateCount > 0) {
    sections.push({
      key: "published_tp_tpl",
      summary: vNaForm(
        u.publishedTreatmentProgramTemplateCount,
        "опубликованном шаблоне программ лечения",
        "опубликованных шаблонах программ лечения",
        "опубликованных шаблонах программ лечения",
      ),
      refs: u.publishedTreatmentProgramTemplateRefs,
      total: u.publishedTreatmentProgramTemplateCount,
    });
  }
  if (u.draftTreatmentProgramTemplateCount > 0) {
    sections.push({
      key: "draft_tp_tpl",
      summary: vNaForm(
        u.draftTreatmentProgramTemplateCount,
        "черновом шаблоне программ лечения",
        "черновых шаблонах программ лечения",
        "черновых шаблонах программ лечения",
      ),
      refs: u.draftTreatmentProgramTemplateRefs,
      total: u.draftTreatmentProgramTemplateCount,
    });
  }
  if (u.archivedTreatmentProgramTemplateCount > 0) {
    sections.push({
      key: "archived_tp_tpl",
      summary: vNaForm(
        u.archivedTreatmentProgramTemplateCount,
        "архивном шаблоне программ лечения (история)",
        "архивных шаблонах программ лечения (история)",
        "архивных шаблонах программ лечения (история)",
      ),
      refs: u.archivedTreatmentProgramTemplateRefs,
      total: u.archivedTreatmentProgramTemplateCount,
    });
  }
  if (u.activeTreatmentProgramInstanceCount > 0) {
    sections.push({
      key: "active_tp_inst",
      summary: vNaForm(
        u.activeTreatmentProgramInstanceCount,
        "активной программе у пациентов",
        "активных программах у пациентов",
        "активных программах у пациентов",
      ),
      refs: u.activeTreatmentProgramInstanceRefs,
      total: u.activeTreatmentProgramInstanceCount,
    });
  }
  if (u.completedTreatmentProgramInstanceCount > 0) {
    sections.push({
      key: "completed_tp_inst",
      summary: vNaForm(
        u.completedTreatmentProgramInstanceCount,
        "завершённой программе у пациентов (история)",
        "завершённых программах у пациентов (история)",
        "завершённых программах у пациентов (история)",
      ),
      refs: u.completedTreatmentProgramInstanceRefs,
      total: u.completedTreatmentProgramInstanceCount,
    });
  }
  if (u.testAttemptsRecordedCount > 0) {
    sections.push({
      key: "test_attempts_history",
      summary: `Зафиксировано попыток прохождения блока набора в программах: ${u.testAttemptsRecordedCount}`,
      refs: [],
      total: u.testAttemptsRecordedCount,
    });
  }
  return sections;
}
