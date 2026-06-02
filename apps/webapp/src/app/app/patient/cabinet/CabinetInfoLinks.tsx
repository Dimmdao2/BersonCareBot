import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildCabinetInfoLinkTiles } from "@/modules/help-content/cabinetInfoLinkTiles";
import { listHelpArticlesForPatient } from "@/modules/help-content/listHelpArticles";
import { cn } from "@/lib/utils";
import { patientCardClass, patientInfoLinkTileClass } from "@/shared/ui/patientVisual";

/** Полезные ссылки записи: deep link на статьи справки только если они опубликованы в CMS. */
export async function CabinetInfoLinks() {
  const deps = buildAppDeps();
  const articles = await listHelpArticlesForPatient(deps.contentPages);
  const tiles = buildCabinetInfoLinkTiles(new Set(articles.map((a) => a.slug)));

  return (
    <Card className={cn(patientCardClass, "ring-0")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Полезная информация</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className={patientInfoLinkTileClass}>
            {t.label}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
