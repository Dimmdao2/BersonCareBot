/**
 * One Cyrillic → latin table for every place that has to derive a latin machine identifier
 * (organization address, booking form field key) from a human Russian label.
 */
const CYRILLIC_TRANSLITERATION: Readonly<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/** Lowercases and replaces Cyrillic letters; every other character passes through unchanged. */
export function transliterateCyrillic(value: string): string {
  return [...value.normalize('NFKC').toLowerCase()]
    .map((char) => CYRILLIC_TRANSLITERATION[char] ?? char)
    .join('');
}
