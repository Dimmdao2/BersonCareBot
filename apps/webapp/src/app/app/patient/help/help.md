# Patient `/help`

База знаний пациента из CMS (раздел `help`).

## Маршруты

- **`page.tsx`** — каталог статей + ссылки (сообщения, профиль, запись, поддержка).
- **`[slug]/page.tsx`** — одна статья; `force-dynamic`.

## Данные

- Список: `listHelpArticlesForPatient` → `content_pages` где `section = help`, опубликованы.
- Статья: `contentCatalog.getBySlug` + проверка `isHelpSectionSlug`.

## Связанные компоненты

- `PatientHelpArticleList.tsx` — карточки каталога
- `HelpSupportLink.tsx` — ссылка на поддержку
- `CabinetInfoLinks.tsx` (cabinet) — плитки с deep link на `preparation` / `cost` при наличии контента

Канон и архитектура: [`modules/help-content/README.md`](../../../modules/help-content/README.md).
