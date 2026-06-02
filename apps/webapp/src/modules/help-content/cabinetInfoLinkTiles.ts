import { routePaths } from "@/app-layer/routes/paths";
import {
  HELP_CANONICAL_ARTICLE_SLUG_COST,
  HELP_CANONICAL_ARTICLE_SLUG_PREPARATION,
} from "./canonicalSlugs";

export type CabinetInfoLinkTile = { href: string; label: string };

/** Плитки «Полезная информация»; статьи справки — только при опубликованном slug. */
export function buildCabinetInfoLinkTiles(publishedHelpSlugs: ReadonlySet<string>): CabinetInfoLinkTile[] {
  const tiles: CabinetInfoLinkTile[] = [
    { href: routePaths.patientAddress, label: "Адрес кабинета" },
    { href: routePaths.bookingNew, label: "Записаться" },
  ];
  if (publishedHelpSlugs.has(HELP_CANONICAL_ARTICLE_SLUG_PREPARATION)) {
    tiles.push({
      href: routePaths.patientHelpArticle(HELP_CANONICAL_ARTICLE_SLUG_PREPARATION),
      label: "Как подготовиться",
    });
  }
  if (publishedHelpSlugs.has(HELP_CANONICAL_ARTICLE_SLUG_COST)) {
    tiles.push({
      href: routePaths.patientHelpArticle(HELP_CANONICAL_ARTICLE_SLUG_COST),
      label: "Стоимость",
    });
  }
  tiles.push({ href: routePaths.patientHelp, label: "Справка и контакты" });
  return tiles;
}
