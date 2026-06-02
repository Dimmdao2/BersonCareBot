import { revalidatePath } from "next/cache";
import { routePaths } from "@/app-layer/routes/paths";
import { isHelpSectionSlug } from "@/modules/content-sections/types";

/** Инвалидация patient-facing кэша после изменений `content_pages`. */
export function revalidatePatientContentPaths(args: {
  slug: string;
  section: string;
  previousSlug?: string | null;
  previousSection?: string | null;
  /** Сбросить layout разделов (по умолчанию true). */
  revalidateSectionsLayout?: boolean;
}): void {
  const slugs = new Set<string>([args.slug.trim()]);
  const prevSlug = args.previousSlug?.trim();
  if (prevSlug) slugs.add(prevSlug);

  for (const s of slugs) {
    if (!s) continue;
    revalidatePath(`/app/patient/content/${encodeURIComponent(s)}`);
  }

  const sections = new Set<string>([args.section.trim()]);
  const prevSec = args.previousSection?.trim();
  if (prevSec) sections.add(prevSec);

  let helpTouched = false;
  for (const sec of sections) {
    if (sec && isHelpSectionSlug(sec)) helpTouched = true;
  }
  if (helpTouched) {
    revalidatePath(routePaths.patientHelp);
    revalidatePath(routePaths.bookingNew);
    for (const s of slugs) {
      if (s) revalidatePath(routePaths.patientHelpArticle(s));
    }
  }

  if (args.revalidateSectionsLayout !== false) {
    revalidatePath("/app/patient/sections", "layout");
  }
}
