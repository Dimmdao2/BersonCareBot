# Patient `/help`

База знаний пациента из CMS (раздел `help`).

## Маршруты

- **`page.tsx`** — каталог статей + ссылки (сообщения, профиль, запись, поддержка).
- **`[slug]/page.tsx`** — одна статья; `force-dynamic`.

## IA: канонические slug

Смысл страниц и ожидаемые slug — в `modules/help-content/canonicalSlugs.ts` (`HELP_CANONICAL_ARTICLE_IA`).

| Slug | Назначение |
|------|------------|
| `preparation` | Как подготовиться к приёму |
| `after-visit` | Рекомендации после приёма |
| `services-pricing` | Услуги и ориентиры по стоимости (канон; legacy `cost` — alias в плитках) |
| `app-guide` | Справка по приложению |
| `address-spb` | Адрес кабинета, Санкт-Петербург |
| `address-msk` | Адрес кабинета, Москва |
| `about` | Кратко о специалисте + ссылка на полный сайт |

Любые другие slug допустимы в каталоге `/help`. Условные плитки (`buildCabinetInfoLinkTiles`, см. `HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES` + `resolvePublishedServicesPricingSlug`) на фазе 1 — только **подготовка** и **стоимость**; остальные канонические slug видны в каталоге `/help` после публикации, плитки — в фазах 2–3 плана booking/help.

## Публикация через CMS

1. Врач: «Статьи справки» → `/app/doctor/content?section=help`.
2. Создать страницу с **точным** slug из таблицы выше, опубликовать.
3. Плитки «Как подготовиться» / «Стоимость» (`CabinetInfoLinks`, монтирование на «Запись» — фаза 2) — только если опубликованы slug `preparation` и `services-pricing` (или legacy `cost`).
4. Адреса по городам: отдельные статьи `address-spb` / `address-msk`; общий маршрут `/app/patient/address` остаётся fallback.

## Данные

- Список: `listHelpArticlesForPatient` → `content_pages` где `section = help`, опубликованы.
- Статья: `contentCatalog.getBySlug` + проверка `isHelpSectionSlug`.

## Связанные компоненты

- `PatientHelpArticleList.tsx` — карточки каталога
- `HelpSupportLink.tsx` — ссылка на поддержку
- `CabinetInfoLinks.tsx` (cabinet) — плитки с deep link на канонические slug при наличии контента

Канон и архитектура: [`modules/help-content/README.md`](../../../modules/help-content/README.md).
