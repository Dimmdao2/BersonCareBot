import { getBaseCatalog } from "./catalog";
import type { ContentStubItem } from "./types";
import type { ContentPagesPort } from "@/infra/repos/pgContentPages";
import type { MediaRecord } from "@/modules/media/types";
import { parseMediaFileIdFromAppUrl } from "@/shared/lib/mediaPreviewUrls";

export type ContentCatalogResolver = {
  getBySlug(slug: string): Promise<ContentStubItem | null>;
};

async function attachImageLibraryMedia(
  item: ContentStubItem,
  loadMediaById?: (id: string) => Promise<MediaRecord | null>,
): Promise<ContentStubItem> {
  if (!loadMediaById || !item.imageUrl?.trim()) return item;
  const id = parseMediaFileIdFromAppUrl(item.imageUrl);
  if (!id) return item;
  const row = await loadMediaById(id);
  if (!row) return item;
  return { ...item, imageLibraryMedia: row };
}

export function createContentCatalogResolver(options: {
  testVideoUrl?: string;
  contentPages?: ContentPagesPort;
  loadMediaById?: (id: string) => Promise<MediaRecord | null>;
}): ContentCatalogResolver {
  const base = getBaseCatalog();
  const testVideoUrl = options.testVideoUrl && options.testVideoUrl.length > 0 ? options.testVideoUrl : undefined;

  return {
    async getBySlug(slug: string): Promise<ContentStubItem | null> {
      if (options.contentPages) {
        try {
          const row = await options.contentPages.getBySlug(slug);
          if (row) {
            const bodyText =
              row.bodyMd.trim().length > 0 ? row.bodyMd : row.bodyHtml;
            const bodyFormat =
              row.bodyMd.trim().length > 0
                ? ("markdown" as const)
                : row.bodyHtml.trim().length > 0
                  ? ("legacy-html" as const)
                  : ("markdown" as const);
            const item: ContentStubItem = {
              slug: row.slug,
              title: row.title,
              summary: row.summary,
              bodyText,
              bodyFormat,
              imageUrl: row.imageUrl ?? undefined,
            };
            if (row.videoUrl && (row.videoType === "url" || row.videoType === "youtube")) {
              item.videoSource = { type: "url", url: row.videoUrl };
            } else if (row.videoUrl && row.videoType === "api") {
              item.videoSource = { type: "api", mediaId: row.videoUrl };
            }
            if (slug === "test-video" && testVideoUrl) {
              item.videoSource = { type: "url", url: testVideoUrl };
            }
            return attachImageLibraryMedia(item, options.loadMediaById);
          }
        } catch (err) {
          console.error("content DB fallback:", err);
          // fallback to static catalog
        }
      }

      const entry = base.find((e) => e.slug === slug);
      if (!entry) return null;
      const item: ContentStubItem = { ...entry, bodyFormat: "markdown" };
      if (slug === "test-video" && testVideoUrl) {
        item.videoSource = { type: "url", url: testVideoUrl };
      }
      return attachImageLibraryMedia(item, options.loadMediaById);
    },
  };
}
