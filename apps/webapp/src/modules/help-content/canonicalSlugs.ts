/**
 * Ожидаемые slug статей в разделе `help` для deep link из кабинета/записи.
 * Врач создаёт опубликованные страницы с этими slug в CMS → «Статьи справки».
 */
export const HELP_CANONICAL_ARTICLE_SLUG_PREPARATION = "preparation" as const;
export const HELP_CANONICAL_ARTICLE_SLUG_COST = "cost" as const;

export const HELP_CANONICAL_ARTICLE_SLUGS = [
  HELP_CANONICAL_ARTICLE_SLUG_PREPARATION,
  HELP_CANONICAL_ARTICLE_SLUG_COST,
] as const;

export type HelpCanonicalArticleSlug = (typeof HELP_CANONICAL_ARTICLE_SLUGS)[number];

export function isHelpCanonicalArticleSlug(slug: string): slug is HelpCanonicalArticleSlug {
  return (HELP_CANONICAL_ARTICLE_SLUGS as readonly string[]).includes(slug.trim());
}
