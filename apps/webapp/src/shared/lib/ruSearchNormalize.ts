/**
 * Substring search over Russian / mixed text: NFC + locale-aware lowercasing.
 * Matches picker behavior in {@link filterMediaLibraryPickerItemsByQuery}.
 */
export function normalizeRuSearchString(s: string): string {
  return s.normalize("NFC").toLocaleLowerCase("ru-RU");
}

/**
 * Экранирование `\`, `%`, `_` для литералов внутри паттерна `ILIKE … ESCAPE '\'`.
 */
export function escapePgIlikeLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Сервер PostgreSQL: подстроковый поиск тем же правилом, что и клиентские каталоги
 * ({@link normalizeRuSearchString}), плюс паттерн для колонки `normalize(col, NFC) ILIKE` (второй аргумент — ключевое слово SQL).
 * Возвращает `null`, если строка запроса пустая после trim.
 */
export function pgRuSubstringSearchPattern(rawQuery: string): string | null {
  const t = rawQuery.trim();
  if (!t) return null;
  const needle = normalizeRuSearchString(t);
  return `%${escapePgIlikeLiteral(needle)}%`;
}
