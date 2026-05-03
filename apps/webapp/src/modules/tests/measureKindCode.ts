/** Нормализация подписи вида измерения в уникальный `code` (глобальный пул measure_kinds). */
export function measureKindLabelToCode(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (base.length > 0) return base;
  return `kind-${crypto.randomUUID().slice(0, 8)}`;
}
