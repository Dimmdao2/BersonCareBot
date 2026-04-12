/**
 * Внутренняя ссылка поддержки в webapp (защита от open redirect: только поддерево `/app/`).
 */
export function isAppSupportPath(href: string): boolean {
  const t = href.trim();
  return t.startsWith("/app/");
}
