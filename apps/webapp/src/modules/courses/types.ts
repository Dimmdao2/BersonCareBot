/**
 * §9–10 SYSTEM_LOGIC_SCHEMA: курс — метаданные + ссылка на шаблон программы;
 * уроки — `content_pages` с секцией `lessons` или `course_lessons`, `requires_auth = true`.
 */
export type CourseStatus = "draft" | "published" | "archived";

export const COURSE_LESSON_SECTIONS = ["lessons", "course_lessons"] as const;

/** Минимальные поля `content_pages` для валидации вступительного урока (§10). */
export type IntroLessonPageRecord = {
  id: string;
  section: string;
  slug: string;
  isPublished: boolean;
  requiresAuth: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
};

export type CourseRecord = {
  id: string;
  title: string;
  description: string | null;
  programTemplateId: string;
  introLessonPageId: string | null;
  accessSettings: Record<string, unknown>;
  status: CourseStatus;
  priceMinor: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type CourseCatalogItem = {
  id: string;
  title: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  /** Slug вступительной страницы для ссылки на `/app/patient/content/[slug]`, если задана. */
  introContentSlug: string | null;
};

export type CreateCourseInput = {
  title: string;
  description?: string | null;
  programTemplateId: string;
  introLessonPageId?: string | null;
  accessSettings?: Record<string, unknown>;
  status?: CourseStatus;
  priceMinor?: number;
  currency?: string;
};

export type UpdateCourseInput = {
  title?: string;
  description?: string | null;
  programTemplateId?: string;
  introLessonPageId?: string | null;
  accessSettings?: Record<string, unknown>;
  status?: CourseStatus;
  priceMinor?: number;
  currency?: string;
};

/** См. ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md §7 (refs + лимит списка). */
export const COURSE_USAGE_DETAIL_LIMIT = 12;

export type CourseUsageRef =
  | { kind: "treatment_program_template"; id: string; title: string }
  | { kind: "treatment_program_instance"; id: string; title: string; patientUserId: string }
  | { kind: "content_page"; id: string; title: string };

export type CourseUsageSnapshot = {
  programTemplateId: string;
  programTemplateTitle: string | null;
  /** Один ref на шаблон, привязанный к курсу (идёт из строки курса). */
  programTemplateRef: { kind: "treatment_program_template"; id: string; title: string } | null;
  /** Экземпляры программ по тому же template_id, что у курса (не различение «из записи на курс» / назначение врача). */
  activeTreatmentProgramInstanceCount: number;
  completedTreatmentProgramInstanceCount: number;
  activeTreatmentProgramInstanceRefs: Extract<CourseUsageRef, { kind: "treatment_program_instance" }>[];
  completedTreatmentProgramInstanceRefs: Extract<CourseUsageRef, { kind: "treatment_program_instance" }>[];
  publishedLinkedContentPageCount: number;
  draftLinkedContentPageCount: number;
  archivedLinkedContentPageCount: number;
  publishedLinkedContentPageRefs: Extract<CourseUsageRef, { kind: "content_page" }>[];
  draftLinkedContentPageRefs: Extract<CourseUsageRef, { kind: "content_page" }>[];
  archivedLinkedContentPageRefs: Extract<CourseUsageRef, { kind: "content_page" }>[];
};

export const EMPTY_COURSE_USAGE_SNAPSHOT: CourseUsageSnapshot = {
  programTemplateId: "",
  programTemplateTitle: null,
  programTemplateRef: null,
  activeTreatmentProgramInstanceCount: 0,
  completedTreatmentProgramInstanceCount: 0,
  activeTreatmentProgramInstanceRefs: [],
  completedTreatmentProgramInstanceRefs: [],
  publishedLinkedContentPageCount: 0,
  draftLinkedContentPageCount: 0,
  archivedLinkedContentPageCount: 0,
  publishedLinkedContentPageRefs: [],
  draftLinkedContentPageRefs: [],
  archivedLinkedContentPageRefs: [],
};

/** Перед архивом курса: активные программы по шаблону курса или опубликованные CMS-страницы с `linked_course_id`. */
export function courseArchiveRequiresAcknowledgement(u: CourseUsageSnapshot): boolean {
  return u.activeTreatmentProgramInstanceCount > 0 || u.publishedLinkedContentPageCount > 0;
}

export type ArchiveCourseOptions = {
  acknowledgeUsageWarning?: boolean;
};
