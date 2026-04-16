/**
 * Substring search over Russian / mixed text: NFC + locale-aware lowercasing.
 * Matches picker behavior in {@link filterMediaLibraryPickerItemsByQuery}.
 */
export function normalizeRuSearchString(s: string): string {
  return s.normalize("NFC").toLocaleLowerCase("ru-RU");
}
