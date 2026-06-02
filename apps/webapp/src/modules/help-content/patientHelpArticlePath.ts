import { routePaths } from "@/app-layer/routes/paths";
import { isHelpSectionSlug } from "@/modules/content-sections/types";

/** Канонический URL статьи справки; `null` — оставить `/app/patient/content/[slug]`. */
export function patientHelpArticlePathIfHelpSection(section: string, slug: string): string | null {
  if (!isHelpSectionSlug(section)) return null;
  return routePaths.patientHelpArticle(slug);
}
