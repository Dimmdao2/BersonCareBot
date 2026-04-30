import { mediaPreviewSmUrl } from "@/shared/lib/mediaPreviewUrls";

/**
 * Для квадратных чипов на главной: превью `sm` вместо полного оригинала — меньше трафик,
 * слот ~64px. `preview/md` в БД часто отсутствует (`preview_md_key` пустой при готовом `sm`) → 404 без картинки.
 * Уже превью / внешние URL не трогаем.
 */
export function patientHomeChipImageSrc(src: string | null | undefined): string | null | undefined {
  const u = src?.trim();
  if (!u) return src;
  return mediaPreviewSmUrl(u) ?? u;
}

/** Original media URL to try when generated preview is missing or not ready. */
export function patientHomeChipFallbackImageSrc(src: string | null | undefined): string | null {
  const u = src?.trim();
  if (!u) return null;
  return mediaPreviewSmUrl(u) ? u : null;
}
