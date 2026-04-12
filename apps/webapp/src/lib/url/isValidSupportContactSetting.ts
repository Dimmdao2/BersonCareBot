import { isAppSupportPath } from "@/lib/url/isAppSupportPath";

/** Значение `support_contact_url` в админке: пусто, путь `/app/...` или http(s) URL. */
export function isValidSupportContactSetting(raw: string): boolean {
  const t = raw.trim();
  if (t.length === 0) return true;
  if (isAppSupportPath(t)) return true;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
