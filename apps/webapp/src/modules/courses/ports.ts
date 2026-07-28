import type {
  CourseRecord,
  CourseStatus,
  CourseUsageSnapshot,
  CreateCourseInput,
  IntroLessonPageRecord,
  UpdateCourseInput,
} from './types';

export type CourseIntroPagesPort = {
  getById: (id: string) => Promise<IntroLessonPageRecord | null>;
};

export type CoursesPort = {
  listPublished: () => Promise<CourseRecord[]>;
  /**
   * Курсы, назначенные ЭТОМУ пациенту через его собственные `treatment_program_instances`
   * (совпадение `template_id` инстанса с `program_template_id` курса) — НЕ полный каталог.
   * Полная витрина/маркетплейс — отдельная будущая задача (taskdb #724).
   */
  listAssignedToPatient: (patientUserId: string) => Promise<CourseRecord[]>;
  listForDoctor: (filter: {
    status?: CourseStatus | null;
    includeArchived?: boolean;
  }) => Promise<CourseRecord[]>;
  getById: (id: string) => Promise<CourseRecord | null>;
  create: (input: CreateCourseInput) => Promise<CourseRecord>;
  update: (id: string, patch: UpdateCourseInput) => Promise<CourseRecord | null>;
  /** Сводка использования курса; `null`, если курса нет. */
  getCourseUsageSummary: (courseId: string) => Promise<CourseUsageSnapshot | null>;
};
