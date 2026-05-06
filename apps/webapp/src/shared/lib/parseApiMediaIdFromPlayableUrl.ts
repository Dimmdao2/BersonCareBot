/** Путь вида `/api/media/{uuid}` без query — извлечение `mediaId` для playback API. */
const PATIENT_VIDEO_MEDIA_ID_RE =
  /^\/api\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function parseApiMediaIdFromPlayableUrl(path: string): string | null {
  const base = path.trim().split("?")[0] ?? "";
  const m = PATIENT_VIDEO_MEDIA_ID_RE.exec(base);
  return m?.[1] ?? null;
}
