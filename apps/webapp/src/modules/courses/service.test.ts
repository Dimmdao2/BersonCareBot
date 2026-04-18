import { describe, expect, it, vi } from "vitest";
import { createInMemoryCoursesPort } from "@/infra/repos/inMemoryCourses";
import type { CourseIntroPagesPort } from "./ports";
import { assertValidIntroLessonPage, createCoursesService } from "./service";

const TPL = "11111111-1111-4111-8111-111111111111";
const PAT = "22222222-2222-4222-8222-222222222222";

describe("createCoursesService", () => {
  it("enrollPatient вызывает assignTemplateToPatient с шаблоном курса и assignedBy: null", async () => {
    const courses = createInMemoryCoursesPort();
    const created = await courses.create({
      title: "Курс А",
      programTemplateId: TPL,
      status: "published",
    });
    const assign = vi.fn().mockResolvedValue({ id: "instance-uuid" });
    const introPages: CourseIntroPagesPort = { getById: async () => null };
    const svc = createCoursesService({ courses, introPages, assignTemplateToPatient: assign });
    await svc.enrollPatient({ courseId: created.id, patientUserId: PAT });
    expect(assign).toHaveBeenCalledWith({
      templateId: TPL,
      patientUserId: PAT,
      assignedBy: null,
    });
  });

  it("enrollPatient отклоняет не опубликованный курс", async () => {
    const courses = createInMemoryCoursesPort();
    const created = await courses.create({
      title: "Черновик",
      programTemplateId: TPL,
      status: "draft",
    });
    const svc = createCoursesService({
      courses,
      introPages: { getById: async () => null },
      assignTemplateToPatient: vi.fn(),
    });
    await expect(svc.enrollPatient({ courseId: created.id, patientUserId: PAT })).rejects.toThrow(
      "опубликованный",
    );
  });

  it("enrollPatient отклоняет курс с access_settings.enrollment = closed", async () => {
    const courses = createInMemoryCoursesPort();
    const created = await courses.create({
      title: "Закрытый",
      programTemplateId: TPL,
      status: "published",
      accessSettings: { enrollment: "closed" },
    });
    const svc = createCoursesService({
      courses,
      introPages: { getById: async () => null },
      assignTemplateToPatient: vi.fn(),
    });
    await expect(svc.enrollPatient({ courseId: created.id, patientUserId: PAT })).rejects.toThrow(
      "закрыта",
    );
  });

  it("createCourse проверяет вступительный урок: секция и requires_auth", async () => {
    const courses = createInMemoryCoursesPort();
    const pageId = "33333333-3333-4333-8333-333333333333";
    const introPages: CourseIntroPagesPort = {
      getById: async (id) =>
        id === pageId
          ? {
              id: pageId,
              section: "news",
              slug: "x",
              isPublished: true,
              requiresAuth: true,
              archivedAt: null,
              deletedAt: null,
            }
          : null,
    };
    const svc = createCoursesService({
      courses,
      introPages,
      assignTemplateToPatient: vi.fn(),
    });
    await expect(
      svc.createCourse({
        title: "K",
        programTemplateId: TPL,
        introLessonPageId: pageId,
      }),
    ).rejects.toThrow("lessons");
  });
});

describe("assertValidIntroLessonPage", () => {
  it("принимает course_lessons с requires_auth", () => {
    expect(() =>
      assertValidIntroLessonPage({
        id: "33333333-3333-4333-8333-333333333333",
        section: "course_lessons",
        slug: "intro",
        isPublished: true,
        requiresAuth: true,
        archivedAt: null,
        deletedAt: null,
      }),
    ).not.toThrow();
  });

  it("отклоняет requires_auth = false", () => {
    expect(() =>
      assertValidIntroLessonPage({
        id: "33333333-3333-4333-8333-333333333333",
        section: "lessons",
        slug: "intro",
        isPublished: true,
        requiresAuth: false,
        archivedAt: null,
        deletedAt: null,
      }),
    ).toThrow("requires_auth");
  });
});
