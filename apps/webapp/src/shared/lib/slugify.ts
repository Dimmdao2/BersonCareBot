/**
 * Генерация slug для CMS: латиница из заголовка или fallback `article-XXXXXXXX`.
 */

/** Из заголовка → slug. Если нет пригодных символов или результат только из дефисов — null. */
export function slugFromTitle(title: string): string | null {
  const lower = title.trim().toLowerCase();
  if (!lower) return null;

  const withHyphens = lower.replace(/[^a-z0-9]+/g, "-");
  const collapsed = withHyphens.replace(/-+/g, "-");
  const trimmed = collapsed.replace(/^-+|-+$/g, "");

  if (!trimmed || /^-+$/.test(trimmed)) return null;
  return trimmed;
}

/** Fallback-slug: `article-` + 8 hex (из uuid без дефисов или случайно). */
export function fallbackSlug(seed?: string): string {
  let hex8: string;
  if (seed && seed.trim()) {
    const compact = seed.replace(/-/g, "").toLowerCase();
    const alnum = compact.replace(/[^a-f0-9]/g, "");
    hex8 = (alnum + "00000000").slice(0, 8);
  } else {
    hex8 = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  }
  return `article-${hex8}`;
}
