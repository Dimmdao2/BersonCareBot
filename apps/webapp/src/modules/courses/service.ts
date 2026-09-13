import { assertUuid } from '@/modules/treatment-program/service';
import { CourseArchiveNotFoundError, CourseUsageConfirmationRequiredError } from './errors';
import type { CourseIntroPagesPort, CoursesPort } from './ports';
import type {
  ArchiveCourseOptions,
  CourseCatalogItem,
  CourseRecord,
  CreateCourseInput,
  IntroLessonPageRecord,
  UpdateCourseInput,
} from './types';
import { COURSE_LESSON_SECTIONS, courseArchiveRequiresAcknowledgement } from './types';
import { UserFacingError } from '@/shared/errors/userFacingError';
import { notificationText } from '@/shared/notifications/notificationText';

type AssignTemplate = (input: {
  templateId: string;
  patientUserId: string;
  assignedBy: string | null;
  assignmentSource?: import('@/modules/treatment-program/types').TreatmentProgramAssignmentSource;
}) => Promise<unknown>;

function isCourseLessonSection(section: string): boolean {
  return (COURSE_LESSON_SECTIONS as readonly string[]).includes(section);
}

function enrollmentOpen(accessSettings: Record<string, unknown>): boolean {
  return accessSettings.enrollment !== 'closed';
}

export type CourseWriteOptions = {
  runCourseWrite?: <T>(fn: () => Promise<T>) => Promise<T>;
};

function runCourseWrite<T>(
  options: CourseWriteOptions | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return options?.runCourseWrite ? options.runCourseWrite(fn) : fn();
}

export function assertValidIntroLessonPage(
  row: IntroLessonPageRecord | null,
): asserts row is IntroLessonPageRecord {
  if (!row) {
    throw new UserFacingError(notificationText.courseIntroLessonNotFound);
  }
  if (!isCourseLessonSection(row.section)) {
    throw new UserFacingError(notificationText.courseIntroLessonMustBeFromLessonsSection);
  }
  if (!row.requiresAuth) {
    throw new UserFacingError(
      notificationText.courseIntroLessonMustBeLoggedInOnly,
    );
  }
  if (!row.isPublished || row.archivedAt || row.deletedAt) {
    throw new UserFacingError(
      notificationText.courseIntroLessonMustBePublishedNotArchived,
    );
  }
}

async function toCatalogItem(
  r: CourseRecord,
  introPages: CourseIntroPagesPort,
): Promise<CourseCatalogItem> {
  let introContentSlug: string | null = null;
  if (r.introLessonPageId) {
    const page = await introPages.getById(r.introLessonPageId);
    if (page?.isPublished && !page.archivedAt && !page.deletedAt) {
      introContentSlug = page.slug;
    }
  }
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    priceMinor: r.priceMinor,
    currency: r.currency,
    introContentSlug,
  };
}

export function createCoursesService(deps: {
  courses: CoursesPort;
  introPages: CourseIntroPagesPort;
  assignTemplateToPatient: AssignTemplate;
  /**
   * 3.2: physically refuses a write unless a passing `courses` mutation decision already ran in
   * this request (wired from `buildAppDeps.ts` to `assertMechanicWriteClearance('courses')`).
   * Same shape as `isCourseMechanicEnabled` below — a plain injected function, no `app-layer`
   * import here (`ARCHITECTURE.md`: modules depend only on contracts and injected ports).
   */
  assertWriteClearance: (mechanic: 'courses') => void;
}) {
  const { courses, introPages, assignTemplateToPatient, assertWriteClearance } = deps;

  return {
    async listPublishedCatalog(): Promise<CourseCatalogItem[]> {
      const rows = await courses.listPublished();
      const out: CourseCatalogItem[] = [];
      for (const r of rows) {
        out.push(await toCatalogItem(r, introPages));
      }
      return out;
    },

    /**
     * Курсы, назначенные ТЕКУЩЕМУ пациенту через его собственную программу — НЕ публичный каталог.
     * Полная витрина/маркетплейс — отдельная будущая задача (taskdb #724).
     */
    async listAssignedForPatient(patientUserId: string): Promise<CourseCatalogItem[]> {
      assertUuid(patientUserId);
      const rows = await courses.listAssignedToPatient(patientUserId);
      const out: CourseCatalogItem[] = [];
      for (const r of rows) {
        out.push(await toCatalogItem(r, introPages));
      }
      return out;
    },

    async listCoursesForDoctor(
      filter: { status?: CourseRecord['status'] | null; includeArchived?: boolean } = {},
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

    async getCourseUsage(courseId: string) {
      assertUuid(courseId);
      const snap = await courses.getCourseUsageSummary(courseId.trim());
      if (!snap) throw new UserFacingError(notificationText.courseNotFound);
      return snap;
    },

    async createCourse(input: CreateCourseInput, options?: CourseWriteOptions) {
      assertWriteClearance('courses');
      const title = input.title?.trim() ?? '';
      if (!title) throw new UserFacingError(notificationText.courseNameRequired);
      assertUuid(input.programTemplateId);
      if (input.introLessonPageId) {
        assertUuid(input.introLessonPageId);
        const page = await introPages.getById(input.introLessonPageId);
        assertValidIntroLessonPage(page);
      }
      return runCourseWrite(options, () =>
        courses.create({
          ...input,
          title,
          description: input.description?.trim()
            ? input.description.trim()
            : (input.description ?? null),
        }),
      );
    },

    async updateCourse(
      id: string,
      input: UpdateCourseInput,
      options?: ArchiveCourseOptions,
      writeOptions?: CourseWriteOptions,
    ) {
      assertWriteClearance('courses');
      assertUuid(id);
      const patch: UpdateCourseInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new UserFacingError(notificationText.courseNameRequired);
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

      if (input.status === 'archived') {
        const existing = await courses.getById(id.trim());
        if (!existing) throw new CourseArchiveNotFoundError();
        if (existing.status !== 'archived') {
          const usage = await courses.getCourseUsageSummary(id.trim());
          if (!usage) throw new CourseArchiveNotFoundError();
          if (courseArchiveRequiresAcknowledgement(usage) && !options?.acknowledgeUsageWarning) {
            throw new CourseUsageConfirmationRequiredError(usage);
          }
        }
      }

      const row = await runCourseWrite(writeOptions, () => courses.update(id.trim(), patch));
      if (!row) throw new CourseArchiveNotFoundError();
      return row;
    },

    /**
     * «Покупка»: та же цепочка, что назначение врача (фаза 4) — deep copy шаблона в экземпляр.
     */
    async enrollPatient(params: { courseId: string; patientUserId: string }) {
      assertWriteClearance('courses');
      const courseId = params.courseId?.trim() ?? '';
      const patientUserId = params.patientUserId?.trim() ?? '';
      assertUuid(courseId);
      assertUuid(patientUserId);
      const course = await courses.getById(courseId);
      if (!course) {
        throw new UserFacingError(notificationText.courseNotFound);
      }
      if (course.status !== 'published') {
        throw new UserFacingError(notificationText.courseEnrollOnlyPublished);
      }
      if (!enrollmentOpen(course.accessSettings)) {
        throw new UserFacingError(notificationText.courseEnrollmentClosed);
      }
      return assignTemplateToPatient({
        templateId: course.programTemplateId,
        patientUserId,
        assignedBy: null,
        assignmentSource: 'course',
      });
    },
  };
}

export type CoursesService = ReturnType<typeof createCoursesService>;
