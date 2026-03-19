/**
 * Русская плюрализация: выбирает правильную форму слова по числу.
 * pluralizeRu(1, "отмена", "отмены", "отмен") → "отмена"
 * pluralizeRu(3, "отмена", "отмены", "отмен") → "отмены"
 * pluralizeRu(5, "отмена", "отмены", "отмен") → "отмен"
 */
export function pluralizeRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
