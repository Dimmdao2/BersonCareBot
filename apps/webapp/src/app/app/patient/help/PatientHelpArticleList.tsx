import Link from "next/link";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import type { HelpArticleListItem } from "@/modules/help-content/ports";
import { patientInlineLinkClass, patientMutedTextClass, patientSectionSurfaceClass } from "@/shared/ui/patient/patientVisual";

export function PatientHelpArticleList({ articles }: { articles: HelpArticleListItem[] }) {
  if (articles.length === 0) {
    return (
      <p className={patientMutedTextClass}>
        Пока нет опубликованных статей. Вы можете написать в поддержку — ссылка ниже.
      </p>
    );
  }

  return (
    <ul className={cn(patientSectionSurfaceClass, "m-0 list-none !gap-2 !p-0")}>
      {articles.map((a) => (
        <li key={a.slug}>
          <Link
            href={routePaths.patientHelpArticle(a.slug)}
            className={cn(
              patientSectionSurfaceClass,
              patientInlineLinkClass,
              "block !gap-1 !p-4 no-underline hover:bg-muted/40",
            )}
          >
            <span className="text-base font-semibold text-foreground">{a.title}</span>
            {a.summary.trim() ? <span className={cn(patientMutedTextClass, "line-clamp-2")}>{a.summary}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
