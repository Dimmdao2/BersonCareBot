import { routePaths } from "@/app-layer/routes/paths";
import {
  HELP_CANONICAL_ARTICLE_SLUG_PREPARATION,
  HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES,
  type HelpCanonicalArticleSlug,
  resolvePublishedServicesPricingSlug,
} from "./canonicalSlugs";

export type CabinetInfoLinkTile = { href: string; label: string };

/** Подписи условных плиток по каноническому slug (расширять при добавлении slug в `HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES`). */
const CABINET_TILE_LABEL_BY_SLUG: Partial<Record<HelpCanonicalArticleSlug, string>> = {
  [HELP_CANONICAL_ARTICLE_SLUG_PREPARATION]: "Как подготовиться",
};

/** Плитки «Полезная информация»; статьи справки — только при опубликованном slug. */
export function buildCabinetInfoLinkTiles(publishedHelpSlugs: ReadonlySet<string>): CabinetInfoLinkTile[] {
  const tiles: CabinetInfoLinkTile[] = [
    { href: routePaths.patientAddress, label: "Адрес кабинета" },
    { href: routePaths.bookingNew, label: "Записаться" },
  ];
  for (const slug of HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES) {
    if (!publishedHelpSlugs.has(slug)) continue;
    const label = CABINET_TILE_LABEL_BY_SLUG[slug];
    if (!label) continue;
    tiles.push({ href: routePaths.patientHelpArticle(slug), label });
  }
  const servicesPricingSlug = resolvePublishedServicesPricingSlug(publishedHelpSlugs);
  if (servicesPricingSlug) {
    tiles.push({
      href: routePaths.patientHelpArticle(servicesPricingSlug),
      label: "Стоимость",
    });
  }
  tiles.push({ href: routePaths.patientHelp, label: "Справка и контакты" });
  return tiles;
}
