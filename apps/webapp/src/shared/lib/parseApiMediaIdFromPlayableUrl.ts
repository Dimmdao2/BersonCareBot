/** Путь вида `/api/media/{uuid}` без query — извлечение `mediaId` для playback API. */
const PATIENT_VIDEO_MEDIA_ID_RE =
  /^\/api\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function parseApiMediaIdFromPlayableUrl(path: string): string | null {
  const raw = path.trim();
  const base = raw.split("#")[0]?.split("?")[0] ?? "";
  const m = PATIENT_VIDEO_MEDIA_ID_RE.exec(base);
  return m?.[1] ?? null;
}

/**
 * Абсолютный URL считается библиотечным только при совпадении `origin` с доверенным (например `window.location.origin` или `APP_BASE_URL`).
 */
export function parseApiMediaIdFromHref(href: string, trustedOrigin: string | null | undefined): string | null {
  const fromPath = parseApiMediaIdFromPlayableUrl(href);
  if (fromPath) return fromPath;

  const origin = trustedOrigin?.trim();
  if (!origin) return null;

  try {
    const u = new URL(href.trim());
    if (u.origin !== origin) return null;
    return parseApiMediaIdFromPlayableUrl(u.pathname);
  } catch {
    return null;
  }
}

/**
 * Абсолютный `/api/media/{uuid}` в Markdown: проверка по списку доверенных origin (например `window.location.origin`
 * и опционально `NEXT_PUBLIC_APP_BASE_URL`, выровненный с каноническим `APP_BASE_URL` на деплое).
 */
export function parseApiMediaIdFromMarkdownHref(href: string, trustedOrigins: Iterable<string>): string | null {
  const pathId = parseApiMediaIdFromPlayableUrl(href);
  if (pathId) return pathId;

  const seen = new Set<string>();
  for (const raw of trustedOrigins) {
    const o = raw.trim();
    if (!o || seen.has(o)) continue;
    seen.add(o);
    const id = parseApiMediaIdFromHref(href, o);
    if (id) return id;
  }
  return null;
}
