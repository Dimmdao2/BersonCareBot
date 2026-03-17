import { getBaseCatalog } from "./catalog";
import type { ContentStubItem } from "./types";

/**
 * Каталог контента: уроки, темы «Скорая помощь» и т.п. По идентификатору (slug) возвращается
 * заголовок, текст, картинка, при необходимости — ссылка на видео. Используется на странице
 * контента пациента (/app/patient/content/[slug]).
 */

export type ContentCatalogResolver = {
  getBySlug(slug: string): ContentStubItem | null;
};

/** Создаёт объект каталога; при указании testVideoUrl подставляет его для материала «test-video». */
export function createContentCatalogResolver(options: {
  testVideoUrl?: string;
}): ContentCatalogResolver {
  const base = getBaseCatalog();
  const testVideoUrl = options.testVideoUrl && options.testVideoUrl.length > 0 ? options.testVideoUrl : undefined;

  return {
    /** Находит материал по идентификатору и возвращает его данные или null. */
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
