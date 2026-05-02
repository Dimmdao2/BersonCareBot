import type {
  CourseRecord,
  CourseStatus,
  CourseUsageSnapshot,
  CreateCourseInput,
  IntroLessonPageRecord,
  UpdateCourseInput,
} from "./types";

export type CourseIntroPagesPort = {
  getById: (id: string) => Promise<IntroLessonPageRecord | null>;
};

export type CoursesPort = {
  listPublished: () => Promise<CourseRecord[]>;
  listForDoctor: (filter: { status?: CourseStatus | null; includeArchived?: boolean }) => Promise<CourseRecord[]>;
  getById: (id: string) => Promise<CourseRecord | null>;
  create: (input: CreateCourseInput) => Promise<CourseRecord>;
  update: (id: string, patch: UpdateCourseInput) => Promise<CourseRecord | null>;
  /** Сводка использования курса; `null`, если курса нет. */
  getCourseUsageSummary: (courseId: string) => Promise<CourseUsageSnapshot | null>;
};
