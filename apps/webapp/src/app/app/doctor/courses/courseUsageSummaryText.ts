import type { CourseUsageRef, CourseUsageSnapshot } from "@/modules/courses/types";
import { vNaForm } from "@/app/app/doctor/exercises/exerciseUsageSummaryText";

/** Есть ли экземпляры программ или привязки CMS помимо самого факта привязанного шаблона. */
export function courseUsageHasSecondaryReferences(u: CourseUsageSnapshot): boolean {
  return (
    u.activeTreatmentProgramInstanceCount > 0 ||
    u.completedTreatmentProgramInstanceCount > 0 ||
    u.publishedLinkedContentPageCount > 0 ||
    u.draftLinkedContentPageCount > 0 ||
    u.archivedLinkedContentPageCount > 0
  );
}

export type CourseUsageSection = {
  key: string;
  summary: string;
  refs: CourseUsageRef[];
  total: number;
};

export function courseUsageSections(u: CourseUsageSnapshot): CourseUsageSection[] {
  const sections: CourseUsageSection[] = [];
  if (u.programTemplateRef) {
    sections.push({
      key: "tpl",
      summary: "Привязанный шаблон программы лечения",
      refs: [u.programTemplateRef],
      total: 1,
    });
  }
  if (u.activeTreatmentProgramInstanceCount > 0) {
    sections.push({
      key: "active_inst",
      summary:
        `${vNaForm(
          u.activeTreatmentProgramInstanceCount,
          "активной программе у пациентов по шаблону курса",
          "активных программах у пациентов по шаблону курса",
          "активных программах у пациентов по шаблону курса",
        )} (все экземпляры по шаблону в базе; запись именно на этот курс отдельно не считается).`,
      refs: u.activeTreatmentProgramInstanceRefs,
      total: u.activeTreatmentProgramInstanceCount,
    });
  }
  if (u.completedTreatmentProgramInstanceCount > 0) {
    sections.push({
      key: "completed_inst",
      summary: `${vNaForm(
        u.completedTreatmentProgramInstanceCount,
        "завершённой программе у пациентов по шаблону курса (история)",
        "завершённых программах у пациентов по шаблону курса (история)",
        "завершённых программах у пациентов по шаблону курса (история)",
      )}.`,
      refs: u.completedTreatmentProgramInstanceRefs,
      total: u.completedTreatmentProgramInstanceCount,
    });
  }
  if (u.publishedLinkedContentPageCount > 0) {
    sections.push({
      key: "pub_page",
      summary: vNaForm(
        u.publishedLinkedContentPageCount,
        "опубликованной странице контента с привязкой к курсу",
        "опубликованных страницах контента с привязкой к курсу",
        "опубликованных страницах контента с привязкой к курсу",
      ),
      refs: u.publishedLinkedContentPageRefs,
      total: u.publishedLinkedContentPageCount,
    });
  }
  if (u.draftLinkedContentPageCount > 0) {
    sections.push({
      key: "draft_page",
      summary: vNaForm(
        u.draftLinkedContentPageCount,
        "черновой странице с привязкой к курсу",
        "черновых страницах с привязкой к курсу",
        "черновых страницах с привязкой к курсу",
      ),
      refs: u.draftLinkedContentPageRefs,
      total: u.draftLinkedContentPageCount,
    });
  }
  if (u.archivedLinkedContentPageCount > 0) {
    sections.push({
      key: "arch_page",
      summary: vNaForm(
        u.archivedLinkedContentPageCount,
        "архивной странице с привязкой к курсу (история)",
        "архивных страницах с привязкой к курсу (история)",
        "архивных страницах с привязкой к курсу (история)",
      ),
      refs: u.archivedLinkedContentPageRefs,
      total: u.archivedLinkedContentPageCount,
    });
  }
  return sections;
}
