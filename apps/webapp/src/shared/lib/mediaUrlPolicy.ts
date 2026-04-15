/** Relative URL served by webapp for a row in `media_files`. */
export const API_MEDIA_URL_RE =
  /^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLegacyAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}
