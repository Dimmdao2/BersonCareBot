# content-catalog

Каталог контента: уроки, темы «Скорая помощь» и т.п.

По идентификатору (slug) возвращается заголовок, текст, картинка, при необходимости — источник видео. Базовый каталог задаётся в catalog.ts; резолвер (service.ts) при опции testVideoUrl подставляет URL для материала «test-video». Используется на `/app/patient/content/[slug]` (тематические и системные разделы) и при формировании списков уроков и тем «Скорая помощь». Статьи раздела **`help`** (`section=help`) — каталог `/app/patient/help`, канонический URL `/app/patient/help/[slug]`; запрос на `/content/[slug]` для `section=help` редиректится (см. [`../help-content/README.md`](../help-content/README.md)). Не зависит от интегратора. Картинки и видео из библиотеки CMS хранятся как пути **`/api/media/{uuid}`**; отдача идёт через webapp (редирект на presigned GET в private S3) при **сессии** пользователя, а не прямыми публичными URL MinIO.

## Контракт текста страницы (`content_pages`)

- Основное поле контента в БД: **`body_md`** (Markdown).
- Рендер у пациента: [`MarkdownContent`](../../shared/ui/patient/markdown/MarkdownContent.tsx) + [`MarkdownBodyTree`](../../shared/ui/patient/markdown/markdownRenderTree.tsx); превью редактора CMS — `shared/ui/doctor/markdown/MarkdownPreview.tsx`. Ссылки на YouTube/RuTube → iframe; на **`/api/media/{uuid}`** → [`PatientMediaPlaybackVideo`](../../shared/ui/patient/media/PatientMediaPlaybackVideo.tsx) (patient) / [`DoctorMediaPlaybackVideo`](../../shared/ui/doctor/media/DoctorMediaPlaybackVideo.tsx) (doctor CMS). Детали — [`docs/ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md`](../../../../../docs/ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md).
- **`body_html`** хранит только legacy-контент для записей, созданных до перехода на Markdown; пока `body_md` пустой, резолвер (`createContentCatalogResolver`) подставляет в `ContentStubItem.bodyText` значение из **`body_html`**.
- Если **`body_md`** непустой (после `trim`), используется только он, **`body_html`** для отображения игнорируется.
- Slug материала редактируется в CMS на форме `/app/doctor/content/edit/[id]`; серверная валидация сохраняет уникальность пары `section + slug` и ревалидирует старый и новый patient URL.

## Видимость для пациента

Страницы из `content_pages` попадают в выдачу уроков/скорой и в резолвер slug только если **`is_published = true`**, **`archived_at IS NULL`**, **`deleted_at IS NULL`**. Врач управляет публикацией, архивом и soft-delete на экране `/app/doctor/content` (хаб с боковым меню и фильтром `?section=<slug>` по разделам). Поведение UI и логирование при сбоях БД: `docs/ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md`.
