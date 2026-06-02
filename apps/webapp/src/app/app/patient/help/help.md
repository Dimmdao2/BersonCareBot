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
| `booking` | Запись в приложении; ссылка на `/app/patient/about` |

Любые другие slug допустимы в каталоге `/help`. Условные плитки: `preparation`, `about` (`HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES`), **стоимость** (`resolvePublishedServicesPricingSlug`). Плитка **«Адрес кабинета»** всегда есть; её href city-aware (`address-msk` / `address-spb` при публикации и известном городе) — `patientHelpAddressLink.ts`, фаза 3.

## Публикация через CMS

1. Врач: «Статьи справки» → `/app/doctor/content?section=help`.
2. Создать страницу с **точным** slug из таблицы выше, опубликовать.
3. Плитки «Как подготовиться» / «Стоимость» / «О специалисте» (`CabinetInfoLinks` на `/app/patient/booking/new` и при reuse) — только если опубликованы соответствующие slug (`preparation`, `services-pricing` или legacy `cost`, `about`).
4. Адреса по городам: отдельные статьи `address-spb` / `address-msk`; общий маршрут `/app/patient/address` остаётся fallback.
5. Статья `booking` — редакторский чеклист в `modules/help-content/CMS_EDITOR_CHECKLIST.md`; статическая страница `/app/patient/about` (ссылка на сайт).

## Данные

- Список: `listHelpArticlesForPatient` → `content_pages` где `section = help`, опубликованы.
- Статья: `contentCatalog.getBySlug` + проверка `isHelpSectionSlug`.

## Связанные компоненты

- `PatientHelpArticleList.tsx` — карточки каталога
- `HelpSupportLink.tsx` — ссылка на поддержку
- `CabinetInfoLinks.tsx` / `CabinetInfoLinksCard.tsx` — плитки на «Запись» (`booking/new`) и при reuse; deep link при опубликованном контенте

Канон и архитектура: [`modules/help-content/README.md`](../../../modules/help-content/README.md).
