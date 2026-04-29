import { describe, expect, it } from "vitest";
import type { ContentPagesPort } from "@/infra/repos/pgContentPages";
import { createContentCatalogResolver } from "./service";

describe("content-catalog resolver", () => {
  it("getBySlug returns item for known slug", async () => {
    const resolver = createContentCatalogResolver({});
    const item = await resolver.getBySlug("back-pain");
    expect(item).not.toBeNull();
    expect(item!.slug).toBe("back-pain");
    expect(item!.title).toBe("Острая боль в спине");
    expect(item!.bodyText).toBeDefined();
    expect(item!.videoSource).toBeUndefined();
  });

  it("getBySlug returns null for unknown slug", async () => {
    const resolver = createContentCatalogResolver({});
    expect(await resolver.getBySlug("unknown-slug")).toBeNull();
  });

  it("test-video gets videoSource when testVideoUrl is provided", async () => {
    const resolver = createContentCatalogResolver({
      testVideoUrl: "https://example.com/test.mp4",
    });
    const item = await resolver.getBySlug("test-video");
    expect(item).not.toBeNull();
    expect(item!.videoSource).toEqual({ type: "url", url: "https://example.com/test.mp4" });
  });

  it("test-video has no videoSource when testVideoUrl is empty", async () => {
    const resolver = createContentCatalogResolver({ testVideoUrl: "" });
    const item = await resolver.getBySlug("test-video");
    expect(item).not.toBeNull();
    expect(item!.videoSource).toBeUndefined();
  });

  it("prefers body_md over body_html when md is non-empty", async () => {
    const port: ContentPagesPort = {
      listBySection: async () => [],
      getBySlug: async (slug) =>
        slug === "md-test"
          ? {
              id: "1",
              section: "lessons",
              slug: "md-test",
              title: "T",
              summary: "",
              bodyMd: "# Hi",
              bodyHtml: "<p>ignore</p>",
              sortOrder: 0,
              isPublished: true,
              requiresAuth: false,
              videoUrl: null,
              videoType: null,
              imageUrl: null,
              archivedAt: null,
              deletedAt: null,
            }
          : null,
      getById: async () => null,
      listAll: async () => [],
      upsert: async () => "",
      updateLifecycle: async () => {},
      reorderInSection: async () => {},
      countPagesWithSectionSlug: async () => 0,
    };
    const resolver = createContentCatalogResolver({ contentPages: port });
    const item = await resolver.getBySlug("md-test");
    expect(item!.bodyText).toBe("# Hi");
    expect(item!.bodyFormat).toBe("markdown");
  });

  it("falls back to body_html when body_md is empty", async () => {
    const port: ContentPagesPort = {
      listBySection: async () => [],
      getBySlug: async (slug) =>
        slug === "legacy"
          ? {
              id: "1",
              section: "lessons",
              slug: "legacy",
              title: "T",
              summary: "",
              bodyMd: "",
              bodyHtml: "<p>legacy</p>",
              sortOrder: 0,
              isPublished: true,
              requiresAuth: false,
              videoUrl: null,
              videoType: null,
              imageUrl: null,
              archivedAt: null,
              deletedAt: null,
            }
          : null,
      getById: async () => null,
      listAll: async () => [],
      upsert: async () => "",
      updateLifecycle: async () => {},
      reorderInSection: async () => {},
      countPagesWithSectionSlug: async () => 0,
    };
    const resolver = createContentCatalogResolver({ contentPages: port });
    const item = await resolver.getBySlug("legacy");
    expect(item!.bodyText).toBe("<p>legacy</p>");
    expect(item!.bodyFormat).toBe("legacy-html");
  });
});
