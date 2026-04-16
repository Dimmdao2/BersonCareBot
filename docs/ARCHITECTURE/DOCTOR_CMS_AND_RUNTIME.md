# Кабинет специалиста: CMS контента и обработка сбоев БД

## Маршруты CMS

- **Хаб:** `/app/doctor/content` — левое меню (новости, мотивации, разделы, фильтр по разделам, библиотека) и список страниц контента.
- **Медиа:** в контенте и библиотеке используются URL вида `/api/media/{uuid}`; файлы в приватном S3, отдача через webapp (редирект на presigned URL) при **входе пользователя** (same-origin cookie). Превью сетки/пикера: `GET /api/media/{uuid}/preview/sm|md`; список и метаданные одной строки для врача: `GET /api/admin/media`, **`GET /api/admin/media/{id}`**; фоновая генерация превью — `docs/MEDIA_PREVIEW_PIPELINE.md`. Правила UI (единый DTO, `MediaThumb`, `ContentHeroImage`, инварианты) — `docs/ARCHITECTURE/MEDIA_PREVIEW_FRONTEND.md`. См. также `docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md` и `apps/webapp/src/app/api/api.md`.
- **Выбор файлов в формах (библиотека, не произвольный URL):**
  - **Общий layout модалок:** [`MediaPickerShell`](../../apps/webapp/src/shared/ui/media/MediaPickerShell.tsx) (широкий `Dialog` / мобильный `Sheet`) + [`MediaPickerPanel`](../../apps/webapp/src/shared/ui/media/MediaPickerPanel.tsx) — поиск, список, опционально папки/сортировка (упражнения), вкладка **«Загрузить с устройства»** → `POST /api/media/upload` с опциональным `folderId` в `FormData` (корень: `folderId=root`). После загрузки тип файла сверяется с `kind` поля (`image` / `video` / `image_or_video`); при несовпадении пользователю показывается сообщение на русском, выбор в форму не подставляется (файл остаётся в библиотеке). Подсказка папки назначения и русские тексты ошибок API — в панели. Новые экраны с выбором медиа должны переиспользовать эти компоненты (см. `.cursor/rules/cms-unified-media-picker-layout.mdc`).
  - **Страница контента** (обложка и поле видео): `MediaLibraryPickerDialog` (`kind`: `image` / `video`), скрытые поля `image_url` / `video_url` в [`ContentForm.tsx`](../../apps/webapp/src/app/app/doctor/content/ContentForm.tsx); сохранение — [`content/actions.ts`](../../apps/webapp/src/app/app/doctor/content/actions.ts) (допускается legacy абсолютный `https://` как у существующих страниц).
  - **Тело страницы (Markdown):** кнопка **«Библиотека или загрузка»** — [`MediaLibraryInsertDialog.tsx`](../../apps/webapp/src/shared/ui/markdown/MediaLibraryInsertDialog.tsx): тот же shell/panel, список `GET /api/admin/media` (`kind=all`); вставка передаёт в колбэк `kind`/`mimeType` строки; сниппет Markdown строит [`markdownSnippetForMediaUrl`](../../apps/webapp/src/shared/ui/markdown/markdownMediaSnippet.ts) (картинки по `kind === image`, по `image/*` MIME или по расширению, включая HEIC/AVIF и т.д.). Редакторы: Toast UI — [`MarkdownEditorToastUiInner.tsx`](../../apps/webapp/src/shared/ui/markdown/MarkdownEditorToastUiInner.tsx), textarea — [`MarkdownEditor.tsx`](../../apps/webapp/src/shared/ui/markdown/MarkdownEditor.tsx).
  - **Упражнения ЛФК** (`/app/doctor/exercises`): один файл медиа — `MediaLibraryPickerDialog` с `kind="image_or_video"` в [`ExerciseForm.tsx`](../../apps/webapp/src/app/app/doctor/exercises/ExerciseForm.tsx); тип `image` | `video` | `gif` выводится из строки библиотеки ([`exerciseMediaFromLibrary.ts`](../../apps/webapp/src/app/app/doctor/exercises/exerciseMediaFromLibrary.ts)); серверная проверка URL — [`exercises/actions.ts`](../../apps/webapp/src/app/app/doctor/exercises/actions.ts) и [`shared/lib/mediaUrlPolicy.ts`](../../apps/webapp/src/shared/lib/mediaUrlPolicy.ts).
- **Фильтр по разделу:** query-параметр `section=<slug>` (slug из `content_sections`). Неизвестный slug обрабатывается как «все страницы» (устойчивость к удалённым разделам в закладках).
- **Разделы (CRUD):** `/app/doctor/content/sections`, создание/редактирование страниц — `/new`, `/edit/[id]`.

Код: `apps/webapp/src/app/app/doctor/content/`, компонент сайдбара `ContentPagesSidebar.tsx`.

Страницы CMS, как и прочий кабинет врача, идут в общем каркасе: `AppShell variant="doctor"` и константы ширины/отступов в `apps/webapp/src/shared/ui/doctorWorkspaceLayout.ts` (см. [`SPECIALIST_CABINET_STRUCTURE.md`](SPECIALIST_CABINET_STRUCTURE.md), подраздел «Единый каркас страниц»).

## Когда БД «нет» (ожидаемо)

- **Vitest** и **`next build` в CI без `DATABASE_URL`:** `webappReposAreInMemory()` в [`apps/webapp/src/config/env.ts`](../../apps/webapp/src/config/env.ts) включает in-memory репозитории; запросы к PostgreSQL для контента не выполняются, падения подключения нет.
- **Локальный `next dev` без `DATABASE_URL`:** конфиг падает при старте с явной ошибкой (нужен URL БД).

Тихий пустой ответ без ошибки в этом режиме — норма для сборки и тестов, не для продакшен-рантайма с настроенной БД.

## Сбой загрузки при живой БД

Если `DATABASE_URL` задан, но запрос падает (сеть, PostgreSQL, SQL), страницы CMS не должны молча показывать «пустой каталог».

Используется:

1. **Лог в stderr** — [`logServerRuntimeError`](../../apps/webapp/src/infra/logging/serverRuntimeLog.ts): одна строка JSON (`service`, `scope`, `digest`, `errName`, `errMessage`, `ts`) + stack отдельной строкой. В systemd/journald это видно как записи unit **`bersoncarebot-webapp-prod.service`** (см. [`SERVER CONVENTIONS`](SERVER%20CONVENTIONS.md); поле `service` в JSON может отличаться от имени unit).
2. **UI** — [`DataLoadFailureNotice`](../../apps/webapp/src/shared/ui/DataLoadFailureNotice.tsx): текст пользователю и **код `digest`** для поддержки; в `NODE_ENV === development` дополнительно текст ошибки в интерфейсе и `console.error` в браузере.

Секреты и полные connection string в лог не пишутся.

## Журнал работ и отчёты

- Хронология реализации (сайдбар, `?section=`, логирование, мягкая деградация): [`../REPORTS/CMS_DOCTOR_HUB_EXECUTION_LOG.md`](../REPORTS/CMS_DOCTOR_HUB_EXECUTION_LOG.md).

## Связанные документы

- Структура кабинета специалиста: [`SPECIALIST_CABINET_STRUCTURE.md`](SPECIALIST_CABINET_STRUCTURE.md)
- Контент для пациента (`content_pages`): [`../../apps/webapp/src/modules/content-catalog/content-catalog.md`](../../apps/webapp/src/modules/content-catalog/content-catalog.md)
