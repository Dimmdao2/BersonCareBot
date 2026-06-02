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
- Подсказка в `ContentForm`: canonical slug **`preparation`**, **`cost`** для плиток кабинета

## Ключевые модули

- `canonicalSlugs.ts` — ожидаемые slug для deep link
- `listHelpArticles.ts` — список для каталога
- `cabinetInfoLinkTiles.ts` — плитки «Полезная информация» (только если статья опубликована)
- `patientHelpArticlePath.ts` — редирект с `/content`
- Инвалидация кэша: `app-layer/content/revalidatePatientContentPaths.ts` (вызывается из CMS actions)

## Таксономия

Роль страницы `help_article` — через `contentPageRoleForSection` при `section=help` (`content-sections/content-page-roles.ts`). Отдельной колонки `kind` у `content_pages` нет.

## Документация

- [`docs/ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md`](../../../../../docs/ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md)
- [`docs/ACTIVE_WORKQUEUE.md`](../../../../../docs/ACTIVE_WORKQUEUE.md) §фаза 6
- Миграция: `apps/webapp/db/drizzle-migrations/0103_help_content_section.sql`
