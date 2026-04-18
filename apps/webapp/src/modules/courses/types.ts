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
