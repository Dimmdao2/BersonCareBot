/**
 * Разрешённые схемы для открытия ссылок из данных пользователя/интегратора (не javascript:).
 */
export function isSafeExternalHref(url: string): boolean {
  try {
    const parsed = new URL(url, "https://placeholder.invalid");
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
