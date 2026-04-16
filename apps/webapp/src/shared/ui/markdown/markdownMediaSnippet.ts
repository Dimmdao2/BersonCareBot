/**
 * Сниппет Markdown для вставки файла из медиабиблиотеки: картинки — ![alt](url), остальное — ссылка.
 * Учитывает kind/mime с сервера (HEIC, AVIF и т.д.), не только расширение имени файла.
 */
export function markdownSnippetForMediaUrl(
  url: string,
  filename: string,
  meta?: { kind?: string; mimeType?: string },
): string {
  const safeName = filename.replace(/[[\]]/g, "");
  const mime = meta?.mimeType?.toLowerCase() ?? "";
  const asImage =
    meta?.kind === "image" ||
    mime.startsWith("image/") ||
    /\.(jpe?g|png|gif|webp|avif|heic|heif|tiff|tif|svg)$/i.test(filename);
  const snippet = asImage ? `![${safeName}](${url})` : `[${safeName}](${url})`;
  return `${snippet}\n`;
}
