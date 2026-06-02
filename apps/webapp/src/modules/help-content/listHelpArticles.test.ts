import { beforeEach, describe, expect, it, vi } from "vitest";
import { inMemoryContentPagesPort, resetInMemoryContentPagesStoreForTests } from "@/infra/repos/pgContentPages";
import { HELP_SECTION_SLUG } from "@/modules/content-sections/types";
import { listHelpArticlesForPatient } from "./listHelpArticles";

describe("listHelpArticlesForPatient", () => {
  beforeEach(() => {
    resetInMemoryContentPagesStoreForTests();
  });

  it("returns only published pages in help section", async () => {
    await inMemoryContentPagesPort.upsert({
      section: HELP_SECTION_SLUG,
      slug: "faq",
      title: "FAQ",
      summary: "Ответы",
      bodyMd: "Текст",
      bodyHtml: "",
      sortOrder: 0,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
    });
    await inMemoryContentPagesPort.upsert({
      section: "other",
      slug: "other-page",
      title: "Other",
      summary: "",
      bodyMd: "",
      bodyHtml: "",
      sortOrder: 0,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
    });

    const list = await listHelpArticlesForPatient(inMemoryContentPagesPort);
    expect(list).toHaveLength(1);
    expect(list[0]?.slug).toBe("faq");
  });

  it("returns empty when no help pages", async () => {
    const list = await listHelpArticlesForPatient({
      listBySection: vi.fn(async () => []),
    } as never);
    expect(list).toEqual([]);
  });
});
