import { routePaths } from "@/app-layer/routes/paths";
import {
  HELP_CANONICAL_ARTICLE_SLUG_ABOUT,
  HELP_CANONICAL_ARTICLE_SLUG_PREPARATION,
  HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES,
  type HelpCanonicalArticleSlug,
  resolvePublishedServicesPricingSlug,
} from "./canonicalSlugs";

export type CabinetInfoLinkTile = { href: string; label: string };

export type BuildCabinetInfoLinkTilesOptions = {
  /** На экране «Запись» — без плитки «Записаться». */
  omitBookingCta?: boolean;
};

/** Подписи условных плиток по каноническому slug (расширять при добавлении slug в `HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES`). */
const CABINET_TILE_LABEL_BY_SLUG: Partial<Record<HelpCanonicalArticleSlug, string>> = {
  [HELP_CANONICAL_ARTICLE_SLUG_PREPARATION]: "Как подготовиться",
  [HELP_CANONICAL_ARTICLE_SLUG_ABOUT]: "О специалисте",
};

/** Плитки «Полезная информация»; статьи справки — только при опубликованном slug. */
export function buildCabinetInfoLinkTiles(
  publishedHelpSlugs: ReadonlySet<string>,
  options: BuildCabinetInfoLinkTilesOptions = {},
): CabinetInfoLinkTile[] {
  const tiles: CabinetInfoLinkTile[] = [{ href: routePaths.patientAddress, label: "Адрес кабинета" }];
  if (!options.omitBookingCta) {
    tiles.push({ href: routePaths.bookingNew, label: "Записаться" });
  }
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
