import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  buildCabinetInfoLinkTiles,
  type BuildCabinetInfoLinkTilesOptions,
} from "@/modules/help-content/cabinetInfoLinkTiles";
import { listHelpArticlesForPatient } from "@/modules/help-content/listHelpArticles";
import { CabinetInfoLinksCard } from "./CabinetInfoLinksCard";

export type CabinetInfoLinksSurface = "cabinet" | "booking";

/** Полезные ссылки: deep link на статьи справки только если опубликованы в CMS. */
export async function CabinetInfoLinks({
  surface = "cabinet",
}: {
  surface?: CabinetInfoLinksSurface;
} = {}) {
  const deps = buildAppDeps();
  const articles = await listHelpArticlesForPatient(deps.contentPages);
  const options: BuildCabinetInfoLinkTilesOptions =
    surface === "booking" ? { omitBookingCta: true } : {};
  const tiles = buildCabinetInfoLinkTiles(new Set(articles.map((a) => a.slug)), options);

  return <CabinetInfoLinksCard tiles={tiles} />;
}
