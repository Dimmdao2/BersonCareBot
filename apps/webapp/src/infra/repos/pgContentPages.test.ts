import { beforeEach, describe, expect, it } from "vitest";
import {
  inMemoryContentPagesPort,
  resetInMemoryContentPagesStoreForTests,
} from "@/infra/repos/pgContentPages";

describe("inMemoryContentPagesPort (linked_course_id)", () => {
  beforeEach(() => {
    resetInMemoryContentPagesStoreForTests();
  });

  it("upserts and returns linkedCourseId via getById", async () => {
    const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const id = await inMemoryContentPagesPort.upsert({
      section: "lessons",
      slug: "promo",
      title: "Promo",
      summary: "",
      bodyMd: "# x",
      bodyHtml: "",
      sortOrder: 0,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
      linkedCourseId: courseId,
    });
    const row = await inMemoryContentPagesPort.getById(id);
    expect(row?.linkedCourseId).toBe(courseId);
  });

  it("clears linkedCourseId on upsert when null", async () => {
    const courseId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await inMemoryContentPagesPort.upsert({
      section: "lessons",
      slug: "p2",
      title: "A",
      summary: "",
      bodyMd: "",
      bodyHtml: "",
      sortOrder: 0,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
      linkedCourseId: courseId,
    });
    await inMemoryContentPagesPort.upsert({
      section: "lessons",
      slug: "p2",
      title: "A",
      summary: "",
      bodyMd: "",
      bodyHtml: "",
      sortOrder: 0,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
      linkedCourseId: null,
    });
    const row = await inMemoryContentPagesPort.getBySlug("p2");
    expect(row?.linkedCourseId).toBeNull();
  });

  it("updateFull changes section without duplicating row", async () => {
    const id = await inMemoryContentPagesPort.upsert({
      section: "a",
      slug: "shared-slug",
      title: "T",
      summary: "",
      bodyMd: "x",
      bodyHtml: "",
      sortOrder: 1,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
      linkedCourseId: null,
    });
    await inMemoryContentPagesPort.updateFull(id, {
      section: "b",
      slug: "shared-slug",
      title: "T2",
      summary: "",
      bodyMd: "y",
      bodyHtml: "",
      sortOrder: 0,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
      linkedCourseId: null,
    });
    const all = await inMemoryContentPagesPort.listAll();
    expect(all.filter((p) => p.slug === "shared-slug")).toHaveLength(1);
    const row = await inMemoryContentPagesPort.getById(id);
    expect(row?.section).toBe("b");
    expect(row?.bodyMd).toBe("y");
  });
});
