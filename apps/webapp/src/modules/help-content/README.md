# help-content

Справка пациента: статьи из CMS-раздела `help` (`content_sections.slug = help`).

## Маршруты пациента

| URL | Назначение |
|-----|------------|
| `/app/patient/help` | Каталог опубликованных статей (`listHelpArticlesForPatient`) |
| `/app/patient/help/[slug]` | Статья (рендер через `PatientContentSlugArticle`) |
| `/app/patient/content/[slug]` | Для `section=help` — **301 redirect** на `/help/[slug]` |

## CMS (врач)

- Сайдбар хаба контента: «Статьи справки» → `/app/doctor/content?section=help`
- Создание: `/app/doctor/content/new?section=help`
- Подсказка в `ContentForm`: список канонических slug из `HELP_CANONICAL_ARTICLE_SLUGS` + смысл в `HELP_CANONICAL_ARTICLE_IA`

### Правило публикации

Плитки «Полезная информация» (кабинет, позже — «Запись») показывают deep link на статью **только если** в CMS опубликована страница с slug из `HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES` или `resolvePublishedServicesPricingSlug`. Неопубликованный slug — плитка не появляется. Все опубликованные статьи раздела `help` — в каталоге `/help` (включая канонические slug без плитки).

Для «Стоимость» канонический slug — `services-pricing`; legacy `cost` поддерживается в `resolvePublishedServicesPricingSlug` до перепубликации.

## IA канонических статей

| Slug | Смысл |
|------|--------|
| `preparation` | Подготовка к приёму |
| `after-visit` | После приёма |
| `services-pricing` | Услуги и стоимость |
| `app-guide` | Справка по приложению |
| `address-spb` | Адрес, СПб |
| `address-msk` | Адрес, Москва |
| `about` | О специалисте (+ ссылка на сайт в тексте) |

Подробнее: [`apps/webapp/src/app/app/patient/help/help.md`](../../app/app/patient/help/help.md).

## Ключевые модули

- `canonicalSlugs.ts` — slug, IA-метаданные, `HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES`, `resolvePublishedServicesPricingSlug`
- `listHelpArticles.ts` — список для каталога
- `cabinetInfoLinkTiles.ts` — плитки «Полезная информация» (только если статья опубликована)
- `patientHelpArticlePath.ts` — редирект с `/content`
- Инвалидация кэша: `app-layer/content/revalidatePatientContentPaths.ts` (вызывается из CMS actions)

## Таксономия

Роль страницы `help_article` — через `contentPageRoleForSection` при `section=help` (`content-sections/content-page-roles.ts`). Отдельной колонки `kind` у `content_pages` нет.

## Журнал

- [`LOG.md`](LOG.md) — фаза 1 IA/slug (2026-06-03)

## Документация

- [`docs/ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md`](../../../../../docs/ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md)
- [`docs/ACTIVE_WORKQUEUE.md`](../../../../../docs/ACTIVE_WORKQUEUE.md) §фаза 6
- Миграция: `apps/webapp/db/drizzle-migrations/0103_help_content_section.sql`
