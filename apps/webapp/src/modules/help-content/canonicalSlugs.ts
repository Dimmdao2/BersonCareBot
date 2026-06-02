/**
 * Канонические slug статей раздела CMS `help` для deep link из кабинета, записи и каталога `/help`.
 * Врач публикует страницы с этими slug → плитки и ссылки появляются только для опубликованных статей.
 *
 * @see HELP_CANONICAL_ARTICLE_IA — смысл каждой страницы для редактора
 * @see apps/webapp/src/app/app/patient/help/help.md — IA раздела
 */

export const HELP_CANONICAL_ARTICLE_SLUG_PREPARATION = "preparation" as const;
export const HELP_CANONICAL_ARTICLE_SLUG_AFTER_VISIT = "after-visit" as const;
export const HELP_CANONICAL_ARTICLE_SLUG_SERVICES_PRICING = "services-pricing" as const;
export const HELP_CANONICAL_ARTICLE_SLUG_APP_GUIDE = "app-guide" as const;
export const HELP_CANONICAL_ARTICLE_SLUG_ADDRESS_SPB = "address-spb" as const;
export const HELP_CANONICAL_ARTICLE_SLUG_ADDRESS_MSK = "address-msk" as const;
export const HELP_CANONICAL_ARTICLE_SLUG_ABOUT = "about" as const;
/** Справка по записи в приложении; на странице — ссылка на `/app/patient/about`. */
export const HELP_CANONICAL_ARTICLE_SLUG_BOOKING = "booking" as const;

/** Устаревший slug; плитки принимают его как alias для `services-pricing` до перепубликации в CMS. */
export const HELP_CANONICAL_ARTICLE_SLUG_COST_LEGACY = "cost" as const;

export const HELP_CANONICAL_ARTICLE_SLUGS = [
  HELP_CANONICAL_ARTICLE_SLUG_PREPARATION,
  HELP_CANONICAL_ARTICLE_SLUG_AFTER_VISIT,
  HELP_CANONICAL_ARTICLE_SLUG_SERVICES_PRICING,
  HELP_CANONICAL_ARTICLE_SLUG_APP_GUIDE,
  HELP_CANONICAL_ARTICLE_SLUG_ADDRESS_SPB,
  HELP_CANONICAL_ARTICLE_SLUG_ADDRESS_MSK,
  HELP_CANONICAL_ARTICLE_SLUG_ABOUT,
  HELP_CANONICAL_ARTICLE_SLUG_BOOKING,
] as const;

export type HelpCanonicalArticleSlug = (typeof HELP_CANONICAL_ARTICLE_SLUGS)[number];

/**
 * Slug с условной плиткой в `buildCabinetInfoLinkTiles`.
 * «Стоимость» — отдельно через `resolvePublishedServicesPricingSlug` (`services-pricing` / legacy `cost`).
 * Адреса по городам — фаза 3 (city-aware).
 */
export const HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES = [
  HELP_CANONICAL_ARTICLE_SLUG_PREPARATION,
  HELP_CANONICAL_ARTICLE_SLUG_ABOUT,
] as const;

/** Пользовательский смысл канонических статей (редактор CMS / IA `/help`). */
export const HELP_CANONICAL_ARTICLE_IA: Readonly<
  Record<HelpCanonicalArticleSlug, { title: string; purpose: string }>
> = {
  [HELP_CANONICAL_ARTICLE_SLUG_PREPARATION]: {
    title: "Подготовка к приёму",
    purpose: "Как подготовиться к визиту: что взять, ограничения, сроки.",
  },
  [HELP_CANONICAL_ARTICLE_SLUG_AFTER_VISIT]: {
    title: "После приёма",
    purpose: "Рекомендации и ограничения после консультации.",
  },
  [HELP_CANONICAL_ARTICLE_SLUG_SERVICES_PRICING]: {
    title: "Услуги и стоимость",
    purpose: "Общая страница услуг и ориентиров по цене (не привязана к одному городу).",
  },
  [HELP_CANONICAL_ARTICLE_SLUG_APP_GUIDE]: {
    title: "Справка по приложению",
    purpose: "Как пользоваться кабинетом: запись, программа, уведомления.",
  },
  [HELP_CANONICAL_ARTICLE_SLUG_ADDRESS_SPB]: {
    title: "Адрес — Санкт-Петербург",
    purpose: "Адрес и как добраться до кабинета в СПб; ссылки на карты при необходимости.",
  },
  [HELP_CANONICAL_ARTICLE_SLUG_ADDRESS_MSK]: {
    title: "Адрес — Москва",
    purpose: "Адрес и как добраться до кабинета в Москве.",
  },
  [HELP_CANONICAL_ARTICLE_SLUG_ABOUT]: {
    title: "О специалисте",
    purpose: "Кратко «обо мне»; в тексте — ссылка на полный сайт; см. также `/app/patient/about`.",
  },
  [HELP_CANONICAL_ARTICLE_SLUG_BOOKING]: {
    title: "Запись на приём",
    purpose: "Как записаться в приложении; на странице — ссылка на `/app/patient/about`.",
  },
};

export function isHelpCanonicalArticleSlug(slug: string): slug is HelpCanonicalArticleSlug {
  return (HELP_CANONICAL_ARTICLE_SLUGS as readonly string[]).includes(slug.trim());
}

/** Slug опубликованной статьи «услуги/стоимость» (канон или legacy `cost`). */
export function resolvePublishedServicesPricingSlug(
  publishedHelpSlugs: ReadonlySet<string>,
): typeof HELP_CANONICAL_ARTICLE_SLUG_SERVICES_PRICING | typeof HELP_CANONICAL_ARTICLE_SLUG_COST_LEGACY | null {
  if (publishedHelpSlugs.has(HELP_CANONICAL_ARTICLE_SLUG_SERVICES_PRICING)) {
    return HELP_CANONICAL_ARTICLE_SLUG_SERVICES_PRICING;
  }
  if (publishedHelpSlugs.has(HELP_CANONICAL_ARTICLE_SLUG_COST_LEGACY)) {
    return HELP_CANONICAL_ARTICLE_SLUG_COST_LEGACY;
  }
  return null;
}
