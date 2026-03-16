import { getBaseCatalog } from "./catalog";
import type { ContentStubItem } from "./types";

export type ContentCatalogResolver = {
  getBySlug(slug: string): ContentStubItem | null;
};

/**
 * Resolves content stub by slug. Injects test video URL from env when available.
 * Does not depend on integrator; media URL is webapp-owned (env or future S3 adapter).
 */
export function createContentCatalogResolver(options: {
  /** When set, slug "test-video" gets this as videoSource.url. */
  testVideoUrl?: string;
}): ContentCatalogResolver {
  const base = getBaseCatalog();
  const testVideoUrl = options.testVideoUrl && options.testVideoUrl.length > 0 ? options.testVideoUrl : undefined;

  return {
    getBySlug(slug: string): ContentStubItem | null {
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
