import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertMock = vi.fn();
const getBySlugMock = vi.fn();
const listAllMock = vi.fn();
const getCourseForDoctorMock = vi.fn();
const getByIdMock = vi.fn();
const updateFullMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorAccess: vi.fn().mockResolvedValue({ user: { id: "doc-1" } }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentPages: {
      upsert: upsertMock,
      listAll: listAllMock,
      getById: getByIdMock,
      updateFull: updateFullMock,
    },
    contentSections: { getBySlug: getBySlugMock },
    courses: { getCourseForDoctor: getCourseForDoctorMock },
  }),
}));

import { saveContentPage } from "./actions";

function formWith(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    fd.set(k, v);
  }
  return fd;
}

describe("saveContentPage", () => {
  beforeEach(() => {
    upsertMock.mockClear();
    listAllMock.mockReset();
    listAllMock.mockResolvedValue([]);
    getCourseForDoctorMock.mockReset();
    getCourseForDoctorMock.mockResolvedValue(null);
    getBySlugMock.mockReset();
    getByIdMock.mockReset();
    updateFullMock.mockReset();
    getBySlugMock.mockResolvedValue({
      id: "s1",
      slug: "lessons",
      title: "Уроки",
      description: "",
      sortOrder: 0,
      isVisible: true,
    });
  });

  it("stores body_md and clears body_html when md is non-empty", async () => {
    upsertMock.mockResolvedValue(undefined);
    const fd = formWith({
      section: "lessons",
      slug: "test-page",
      title: "T",
      summary: "S",
      body_md: "# Hello",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyMd: "# Hello",
        bodyHtml: "",
        slug: "test-page",
      }),
    );
  });

  it("keeps legacy body_html when body_md is empty", async () => {
    upsertMock.mockResolvedValue(undefined);
    const fd = formWith({
      section: "lessons",
      slug: "legacy",
      title: "T",
      summary: "S",
      body_md: "",
      body_html: "<p>old</p>",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyMd: "",
        bodyHtml: "<p>old</p>",
      }),
    );
  });

  it("rejects body_md over max length", async () => {
    const long = "x".repeat(50001);
    const fd = formWith({
      section: "lessons",
      slug: "x",
      title: "T",
      summary: "S",
      body_md: long,
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects slug consisting only of hyphens", async () => {
    const fd = formWith({
      section: "lessons",
      slug: "---",
      title: "T",
      summary: "S",
      body_md: "# x",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("дефис");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects unknown section slug", async () => {
    getBySlugMock.mockResolvedValue(null);
    const fd = formWith({
      section: "no-such-section",
      slug: "page",
      title: "T",
      summary: "S",
      body_md: "# x",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("persists image_url when provided", async () => {
    upsertMock.mockResolvedValue(undefined);
    const fd = formWith({
      section: "lessons",
      slug: "with-img",
      title: "T",
      summary: "S",
      body_md: "# x",
      image_url: "https://example.com/a.png",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://example.com/a.png",
      }),
    );
  });

  it("stores api video as videoType=api", async () => {
    upsertMock.mockResolvedValue(undefined);
    const fd = formWith({
      section: "lessons",
      slug: "with-api-video",
      title: "T",
      summary: "S",
      body_md: "# x",
      video_url: "/api/media/11111111-1111-4111-8111-111111111111",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        videoUrl: "/api/media/11111111-1111-4111-8111-111111111111",
        videoType: "api",
      }),
    );
  });

  it("rejects invalid local media url", async () => {
    const fd = formWith({
      section: "lessons",
      slug: "invalid-media",
      title: "T",
      summary: "S",
      body_md: "# x",
      image_url: "/api/media/not-uuid",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("saves new page without sort_order and appends to section end", async () => {
    upsertMock.mockResolvedValue(undefined);
    listAllMock.mockResolvedValue([
      { section: "lessons", slug: "a", sortOrder: 2 },
      { section: "lessons", slug: "b", sortOrder: 4 },
    ]);
    const fd = formWith({
      section: "lessons",
      slug: "new-one",
      title: "New",
      summary: "",
      body_md: "Body",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 5 }));
  });

  it("keeps existing sort order when editing with page_id", async () => {
    updateFullMock.mockResolvedValue(undefined);
    const pageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    getByIdMock.mockResolvedValue({
      id: pageId,
      section: "lessons",
      slug: "existing",
      title: "Old",
      summary: "",
      bodyMd: "",
      bodyHtml: "",
      sortOrder: 7,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
      archivedAt: null,
      deletedAt: null,
      linkedCourseId: null,
    });
    listAllMock.mockResolvedValue([
      { id: pageId, section: "lessons", slug: "existing", sortOrder: 7 },
      { id: "other-id", section: "lessons", slug: "other", sortOrder: 1 },
    ]);
    const fd = formWith({
      page_id: pageId,
      section: "lessons",
      slug: "existing",
      title: "Edited",
      summary: "",
      body_md: "Body",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(true);
    expect(updateFullMock).toHaveBeenCalledWith(pageId, expect.objectContaining({ sortOrder: 7 }));
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("allows changing slug when editing with page_id", async () => {
    updateFullMock.mockResolvedValue(undefined);
    const pageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    getByIdMock.mockResolvedValue({
      id: pageId,
      section: "lessons",
      slug: "old-slug",
      title: "Old",
      summary: "",
      bodyMd: "",
      bodyHtml: "",
      sortOrder: 7,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
      archivedAt: null,
      deletedAt: null,
      linkedCourseId: null,
    });
    listAllMock.mockResolvedValue([
      { id: pageId, section: "lessons", slug: "old-slug", sortOrder: 7 },
      { id: "other-id", section: "lessons", slug: "other", sortOrder: 1 },
    ]);
    const fd = formWith({
      page_id: pageId,
      section: "lessons",
      slug: "new-slug",
      title: "Edited",
      summary: "",
      body_md: "Body",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(true);
    expect(updateFullMock).toHaveBeenCalledWith(pageId, expect.objectContaining({ slug: "new-slug", sortOrder: 7 }));
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("when moving section with page_id appends sort order in target section", async () => {
    updateFullMock.mockResolvedValue(undefined);
    const pageId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    getByIdMock.mockResolvedValue({
      id: pageId,
      section: "from-sec",
      slug: "page-x",
      title: "T",
      summary: "",
      bodyMd: "# x",
      bodyHtml: "",
      sortOrder: 3,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
      archivedAt: null,
      deletedAt: null,
      linkedCourseId: null,
    });
    listAllMock.mockResolvedValue([
      { id: pageId, section: "from-sec", slug: "page-x", sortOrder: 3 },
      { id: "c1", section: "lessons", slug: "a", sortOrder: 2 },
      { id: "c2", section: "lessons", slug: "b", sortOrder: 4 },
    ]);
    const fd = formWith({
      page_id: pageId,
      section: "lessons",
      slug: "page-x",
      title: "T",
      summary: "",
      body_md: "# x",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(true);
    expect(updateFullMock).toHaveBeenCalledWith(pageId, expect.objectContaining({ section: "lessons", sortOrder: 5 }));
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns error when listAll fails", async () => {
    listAllMock.mockRejectedValue(new Error("db unavailable"));
    const fd = formWith({
      section: "lessons",
      slug: "any",
      title: "T",
      summary: "S",
      body_md: "# x",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/список страниц/i);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  const publishedCourseId = "11111111-1111-4111-8111-111111111111";

  it("passes linkedCourseId null when linked_course_id empty", async () => {
    upsertMock.mockResolvedValue(undefined);
    const fd = formWith({
      section: "lessons",
      slug: "no-course",
      title: "T",
      summary: "S",
      body_md: "# x",
      linked_course_id: "",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ linkedCourseId: null }));
    expect(getCourseForDoctorMock).not.toHaveBeenCalled();
  });

  it("rejects invalid linked_course_id", async () => {
    const fd = formWith({
      section: "lessons",
      slug: "bad-course",
      title: "T",
      summary: "S",
      body_md: "# x",
      linked_course_id: "not-a-uuid",
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects linked_course_id when course is not published", async () => {
    getCourseForDoctorMock.mockResolvedValue({
      id: publishedCourseId,
      status: "draft",
      programTemplateId: "22222222-2222-4222-8222-222222222222",
      title: "Draft",
      description: null,
      introLessonPageId: null,
      accessSettings: {},
      priceMinor: 0,
      currency: "RUB",
      createdAt: "",
      updatedAt: "",
    });
    const fd = formWith({
      section: "lessons",
      slug: "x",
      title: "T",
      summary: "S",
      body_md: "# x",
      linked_course_id: publishedCourseId,
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("saves linked_course_id when course is published", async () => {
    upsertMock.mockResolvedValue(undefined);
    getCourseForDoctorMock.mockResolvedValue({
      id: publishedCourseId,
      status: "published",
      programTemplateId: "22222222-2222-4222-8222-222222222222",
      title: "Published",
      description: null,
      introLessonPageId: null,
      accessSettings: {},
      priceMinor: 0,
      currency: "RUB",
      createdAt: "",
      updatedAt: "",
    });
    const fd = formWith({
      section: "lessons",
      slug: "with-course",
      title: "T",
      summary: "S",
      body_md: "# x",
      linked_course_id: publishedCourseId,
    });
    const res = await saveContentPage(null, fd);
    expect(res.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ linkedCourseId: publishedCourseId }),
    );
  });
});
