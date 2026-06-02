import { HELP_SECTION_SLUG } from "@/modules/content-sections/types";
import type { HelpArticleListItem, HelpArticlesListPort } from "./ports";

export type { HelpArticleListItem } from "./ports";

/** Published help pages for patient `/help` (section `help`). */
export async function listHelpArticlesForPatient(
  contentPages: HelpArticlesListPort,
): Promise<HelpArticleListItem[]> {
  const rows = await contentPages.listBySection(HELP_SECTION_SLUG);
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    sortOrder: r.sortOrder,
  }));
}
