import { getBaseCatalog } from "./catalog";
import type { ContentStubItem } from "./types";
import type { ContentPagesPort } from "@/infra/repos/pgContentPages";

export type ContentCatalogResolver = {
  getBySlug(slug: string): Promise<ContentStubItem | null>;
};

export function createContentCatalogResolver(options: {
  testVideoUrl?: string;
  contentPages?: ContentPagesPort;
}): ContentCatalogResolver {
  const base = getBaseCatalog();
  const testVideoUrl = options.testVideoUrl && options.testVideoUrl.length > 0 ? options.testVideoUrl : undefined;

  return {
    async getBySlug(slug: string): Promise<ContentStubItem | null> {
      if (options.contentPages) {
        try {
          const row = await options.contentPages.getBySlug(slug);
          if (row) {
            const item: ContentStubItem = {
              slug: row.slug,
              title: row.title,
              summary: row.summary,
              bodyText: row.bodyHtml,
              imageUrl: row.imageUrl ?? undefined,
            };
            if (row.videoUrl && row.videoType === "url") {
              item.videoSource = { type: "url", url: row.videoUrl };
            } else if (row.videoUrl && row.videoType === "api") {
              item.videoSource = { type: "api", mediaId: row.videoUrl };
            }
            if (slug === "test-video" && testVideoUrl) {
              item.videoSource = { type: "url", url: testVideoUrl };
            }
            return item;
          }
        } catch {
          // fallback to static catalog
        }
      }

      const entry = base.find((e) => e.slug === slug);
      if (!entry) return null;
      const item: ContentStubItem = { ...entry };
      if (slug === "test-video" && testVideoUrl) {
        item.videoSource = { type: "url", url: testVideoUrl };
      }
      return item;
    },
  };
}
