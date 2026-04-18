import { assertUuid } from "@/modules/treatment-program/service";
import type { CourseIntroPagesPort, CoursesPort } from "./ports";
import type {
  CourseCatalogItem,
  CourseRecord,
  CreateCourseInput,
  IntroLessonPageRecord,
  UpdateCourseInput,
} from "./types";
import { COURSE_LESSON_SECTIONS } from "./types";

type AssignTemplate = (input: {
  templateId: string;
  patientUserId: string;
  assignedBy: string | null;
}) => Promise<unknown>;

function isCourseLessonSection(section: string): boolean {
  return (COURSE_LESSON_SECTIONS as readonly string[]).includes(section);
}

function enrollmentOpen(accessSettings: Record<string, unknown>): boolean {
  return accessSettings.enrollment !== "closed";
}

export function assertValidIntroLessonPage(
  row: IntroLessonPageRecord | null,
): asserts row is IntroLessonPageRecord {
  if (!row) {
    throw new Error("Страница вступительного урока не найдена");
  }
  if (!isCourseLessonSection(row.section)) {
    throw new Error(
      `Вступительный урок должен быть в секции lessons или course_lessons (сейчас: ${row.section})`,
    );
  }
  if (!row.requiresAuth) {
    throw new Error("Урок курса должен быть с requires_auth = true");
  }
  if (!row.isPublished || row.archivedAt || row.deletedAt) {
    throw new Error("Страница вступительного урока должна быть опубликована и не в архиве");
  }
}

export function createCoursesService(deps: {
  courses: CoursesPort;
  introPages: CourseIntroPagesPort;
  assignTemplateToPatient: AssignTemplate;
}) {
  const { courses, introPages, assignTemplateToPatient } = deps;

  return {
    async listPublishedCatalog(): Promise<CourseCatalogItem[]> {
      const rows = await courses.listPublished();
      const out: CourseCatalogItem[] = [];
      for (const r of rows) {
        let introContentSlug: string | null = null;
        if (r.introLessonPageId) {
          const page = await introPages.getById(r.introLessonPageId);
          if (page?.isPublished && !page.archivedAt && !page.deletedAt) {
            introContentSlug = page.slug;
          }
        }
        out.push({
          id: r.id,
          title: r.title,
          description: r.description,
          priceMinor: r.priceMinor,
          currency: r.currency,
          introContentSlug,
        });
      }
      return out;
    },

    async listCoursesForDoctor(
      filter: { status?: CourseRecord["status"] | null; includeArchived?: boolean } = {},
    ) {
      return courses.listForDoctor({
        status: filter.status ?? null,
        includeArchived: filter.includeArchived ?? false,
      });
    },

    async getCourseForDoctor(id: string) {
      assertUuid(id);
      return courses.getById(id.trim());
    },

    async createCourse(input: CreateCourseInput) {
      const title = input.title?.trim() ?? "";
      if (!title) throw new Error("Название курса обязательно");
      assertUuid(input.programTemplateId);
      if (input.introLessonPageId) {
        assertUuid(input.introLessonPageId);
        const page = await introPages.getById(input.introLessonPageId);
        assertValidIntroLessonPage(page);
      }
      return courses.create({
        ...input,
        title,
        description: input.description?.trim() ? input.description.trim() : input.description ?? null,
      });
    },

    async updateCourse(id: string, input: UpdateCourseInput) {
      assertUuid(id);
      const patch: UpdateCourseInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new Error("Название курса обязательно");
        patch.title = t;
      }
      if (input.programTemplateId !== undefined) {
        assertUuid(input.programTemplateId);
      }
      if (input.introLessonPageId !== undefined && input.introLessonPageId !== null) {
        assertUuid(input.introLessonPageId);
        const page = await introPages.getById(input.introLessonPageId);
        assertValidIntroLessonPage(page);
      }
      const row = await courses.update(id.trim(), patch);
      if (!row) throw new Error("Курс не найден");
      return row;
    },

    /**
     * «Покупка»: та же цепочка, что назначение врача (фаза 4) — deep copy шаблона в экземпляр.
     */
    async enrollPatient(params: { courseId: string; patientUserId: string }) {
      const courseId = params.courseId?.trim() ?? "";
      const patientUserId = params.patientUserId?.trim() ?? "";
      assertUuid(courseId);
      assertUuid(patientUserId);
      const course = await courses.getById(courseId);
      if (!course) {
        throw new Error("Курс не найден");
      }
      if (course.status !== "published") {
        throw new Error("Доступна только запись на опубликованный курс");
      }
      if (!enrollmentOpen(course.accessSettings)) {
        throw new Error("Запись на курс закрыта");
      }
      return assignTemplateToPatient({
        templateId: course.programTemplateId,
        patientUserId,
        assignedBy: null,
      });
    },
  };
}

export type CoursesService = ReturnType<typeof createCoursesService>;
