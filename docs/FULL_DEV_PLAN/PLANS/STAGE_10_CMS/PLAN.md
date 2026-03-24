## Архив исходного плана

# Этап 10: CMS и контент

> Приоритет: P2  
> Зависимости: Этап 2 (дизайн-система), текущий модуль `content_pages`  
> Риск: средний (XSS при рендеринге Markdown, загрузка медиа)

---

## Шаг 10.1: Зафиксировать целевую модель контента (Markdown вместо raw HTML)

1. **Цель шага**  
   Убрать двусмысленность хранения контента: редактор пишет Markdown, клиент рендерит безопасный HTML.
2. **Точная область изменений**  
   Только `apps/webapp/migrations`, `apps/webapp/src/infra/repos/pgContentPages.ts`, `apps/webapp/src/app/app/doctor/content/actions.ts`, `apps/webapp/src/modules/content-catalog/service.ts`.
3. **Конкретные действия**  
   - Добавить миграцию `apps/webapp/migrations/026_content_pages_markdown.sql` с `ALTER TABLE content_pages ADD COLUMN IF NOT EXISTS body_md TEXT NOT NULL DEFAULT ''`.  
   - В `pgContentPages.ts` расширить `ContentPageRow` и SQL (`SELECT/INSERT/ON CONFLICT`) полем `body_md`.  
   - В `doctor/content/actions.ts` принимать `body_md` из формы, валидировать длину, записывать в порт.  
   - В `content-catalog/service.ts` читать `row.bodyMd` как основной источник, `row.bodyHtml` оставить только как fallback для legacy-данных.
4. **Проверки после шага**  
   - Локально проверить, что новые записи в `content_pages` содержат `body_md`, а старые записи без `body_md` продолжают открываться через fallback.  
   - Проверить, что API/SSR страницы пациента не падают при отсутствии `body_md`.
5. **Критерий успешного выполнения**  
   Все операции чтения/записи контента работают через `body_md`, legacy HTML не ломает отображение.
6. **Тесты**  
   - Обновить/добавить unit-тесты для `apps/webapp/src/modules/content-catalog/service.test.ts` (приоритет `body_md`, fallback на `body_html`).  
   - Добавить unit/integration тест для `doctor/content/actions` на сохранение `body_md` и валидацию длины.  
   - E2E не требуется на этом шаге.
7. **Обновление документации**  
   Обновить `apps/webapp/src/modules/content-catalog/content-catalog.md` с контрактом `body_md`/legacy fallback.

---

## Шаг 10.2: Внедрить Markdown-редактор в кабинет врача

1. **Цель шага**  
   Перевести форму врача с `textarea` для HTML на явный Markdown-редактор с предпросмотром.
2. **Точная область изменений**  
   Только UI доктора: `apps/webapp/src/app/app/doctor/content/ContentForm.tsx`, новые компоненты `apps/webapp/src/shared/ui/markdown/MarkdownEditor.tsx` и `MarkdownPreview.tsx`, `apps/webapp/package.json`.
3. **Конкретные действия**  
   - Подключить зависимости Markdown-рендера (`react-markdown`, `remark-gfm`, sanitizer для preview).  
   - Вынести редактор и preview в отдельные компоненты, не смешивать бизнес-логику и UI формы.  
   - В `ContentForm.tsx` заменить поле `body_html` на `body_md`; сохранить текущие поля (`title`, `section`, `slug`, `summary`, `sort_order`, `is_published`, `video_url`) без изменения контракта.  
   - Указать ограничение на длину Markdown на уровне формы (клиентская подсказка + серверная валидация уже в шаге 10.1).
4. **Проверки после шага**  
   - В форме создания и редактирования страницы preview совпадает с введённым Markdown.  
   - Отправка формы передаёт `body_md`, а не `body_html`.
5. **Критерий успешного выполнения**  
   Доктор может создать и отредактировать контент в Markdown без ручного HTML.
6. **Тесты**  
   - Добавить component test для `MarkdownEditor` (ввод, toolbar-вставки, preview).  
   - Добавить test для `ContentForm` на сериализацию `body_md` в `FormData`.  
   - E2E не требуется на этом шаге.
7. **Обновление документации**  
   Обновить `docs/FULL_DEV_PLAN/PLANS/STAGE_10_CMS/PLAN.md` чеклист шага как выполненный после реализации (без изменения других этапов).

---

## Шаг 10.3: Безопасный рендер Markdown на стороне пациента

1. **Цель шага**  
   Исключить XSS и расхождение между preview врача и отображением у пациента.
2. **Точная область изменений**  
   Только рендер пациентского контента: `apps/webapp/src/app/app/patient/content/[slug]/page.tsx`, `apps/webapp/src/modules/content-catalog/service.ts`, новый компонент `apps/webapp/src/shared/ui/markdown/MarkdownContent.tsx`.
3. **Конкретные действия**  
   - Использовать единый компонент `MarkdownContent` для patient-страницы.  
   - В `MarkdownContent` включить только разрешённые элементы Markdown (заголовки, списки, ссылки, изображения, таблицы при необходимости).  
   - Запретить raw HTML из Markdown (не включать unsafe плагины).  
   - Проверить, что `videoUrl/videoType` из `content_pages` продолжают работать.
4. **Проверки после шага**  
   - Вставка `<script>` или inline `onerror` не исполняется.  
   - Ссылки, списки и заголовки рендерятся корректно.
5. **Критерий успешного выполнения**  
   Patient page показывает форматированный контент без выполнения небезопасного кода.
6. **Тесты**  
   - Unit test для `MarkdownContent` на XSS-сценарии и базовые Markdown-элементы.  
   - Обновить `content-catalog/service.test.ts` на ожидаемое использование Markdown-текста.  
   - E2E не требуется на этом шаге.
7. **Обновление документации**  
   Обновить `apps/webapp/src/app/app/patient/content/content.md` с пометкой, что рендер идёт через Markdown-компонент.

---

## Шаг 10.4: Добавить upload медиа для CMS

1. **Цель шага**  
   Дать врачу контролируемую загрузку файлов для вставки в Markdown.
2. **Точная область изменений**  
   Только медиа-контур webapp: новая миграция `apps/webapp/migrations/027_media_files.sql`, `apps/webapp/src/app/api/media/upload/route.ts` (новый route), `apps/webapp/src/app/api/media/[id]/route.ts`, `apps/webapp/src/infra/repos` (новый media repo), `apps/webapp/src/shared/ui/markdown/MediaUploader.tsx`.
3. **Конкретные действия**  
   - Создать таблицу `media_files` (id, original_name, stored_path, mime_type, size_bytes, uploaded_by, created_at).  
   - Реализовать `POST /api/media/upload` с multipart, лимитом 50MB и белым списком MIME.  
   - В `GET /api/media/[id]` вернуть файл/редирект на storage по `id`.  
   - В `MediaUploader` после успешной загрузки вставлять Markdown-ссылку/изображение в `MarkdownEditor`.
4. **Проверки после шага**  
   - Файл >50MB отклоняется с ожидаемой ошибкой.  
   - Разрешённый файл загружается, возвращается `mediaId/url`, вставка в Markdown работает.
5. **Критерий успешного выполнения**  
   Врач может загрузить файл и использовать его в контенте без прямого редактирования URL.
6. **Тесты**  
   - Integration test для `api/media/upload` (успех, MIME reject, размер reject).  
   - Unit test для `MediaUploader` (обработка успешного/ошибочного ответа).  
   - E2E: добавить один сценарий в `apps/webapp/e2e` на upload + публикацию страницы.
7. **Обновление документации**  
   Обновить `apps/webapp/src/app/api/api.md` с контрактом `POST /api/media/upload` и ограничениями.

---

## Шаг 10.5: Управление секциями и статусами страниц контента

1. **Цель шага**  
   Сделать структуру контента управляемой (секции, порядок, архив/soft-delete) вместо плоского списка.
2. **Точная область изменений**  
   Только CMS-контур: `apps/webapp/src/app/app/doctor/content/page.tsx`, `apps/webapp/src/app/app/doctor/content/actions.ts`, `apps/webapp/src/infra/repos/pgContentPages.ts`, при необходимости миграция `apps/webapp/migrations/028_content_sections_and_status.sql`.
3. **Конкретные действия**  
   - Зафиксировать модель: `section`, `sort_order`, `is_published`, `archived_at`, `deleted_at`.  
   - На странице врача сгруппировать по `section` и добавить явные действия: publish/unpublish, archive/unarchive, soft-delete/restore.  
   - Запретить отображение `archived/deleted` контента в patient-роутах (`/app/patient/lessons`, `/app/patient/content/[slug]`).  
   - Для сортировки использовать явный `sort_order` (без drag-and-drop на этом шаге).
4. **Проверки после шага**  
   - Архивная или удалённая страница отсутствует в списках пациента.  
   - Врач может восстановить страницу из архива/soft-delete.
5. **Критерий успешного выполнения**  
   Статусы контента управляются предсказуемо, пациент видит только опубликованные активные страницы.
6. **Тесты**  
   - Unit/integration тесты репозитория `pgContentPages` на фильтрацию по статусам.  
   - Тест страницы доктора на действия со статусами.  
   - E2E не требуется на этом шаге.
7. **Обновление документации**  
   Обновить `apps/webapp/src/modules/content-catalog/content-catalog.md` и `apps/webapp/src/app/app/patient/content/content.md` с правилами видимости.

---

## Шаг 10.6: Новости и мотивационные цитаты для patient home

1. **Цель шага**  
   Убрать hardcoded поведение в `PatientHomeNewsSection`/`PatientHomeMotivationSection` и перевести на управляемые данные.
2. **Точная область изменений**  
   Только home-контур пациента и doctor CMS для этих сущностей:  
   `apps/webapp/src/app/app/patient/home/PatientHomeNewsSection.tsx`,  
   `apps/webapp/src/app/app/patient/home/PatientHomeMotivationSection.tsx`,  
   `apps/webapp/src/modules/patient-home/*`,  
   новый doctor UI `apps/webapp/src/app/app/doctor/content/news/*`,  
   миграция `apps/webapp/migrations/029_news_and_motivation.sql`.
3. **Конкретные действия**  
   - Создать таблицы `news_items` и `motivational_quotes` с явными статусами публикации.  
   - Добавить сервис чтения для patient home (одна актуальная новость + одна quote на день).  
   - Добавить doctor CRUD для новостей и цитат в CMS-разделе.  
   - Инкремент `views_count` выполнять только при фактическом показе новости пациенту.
4. **Проверки после шага**  
   - Пациент видит только `is_visible=true` новости и `is_active=true` цитаты.  
   - Врач может создать/скрыть/архивировать новости и цитаты.
5. **Критерий успешного выполнения**  
   Patient home формируется из БД, а не из захардкоженных строк.
6. **Тесты**  
   - Unit test сервиса `patient-home` на выбор новости/цитаты и daily-rotation.  
   - Integration test doctor CRUD API/Server Actions.  
   - E2E: сценарий “врач публикует новость -> пациент видит блок”.
7. **Обновление документации**  
   Обновить модульный README в `apps/webapp/src/modules/patient-home/` (или создать, если отсутствует).

---

## Общий критерий завершения этапа 10

- [ ] Контент хранится в `body_md`, legacy HTML работает только как fallback.
- [ ] Врач редактирует контент через Markdown-редактор с preview.
- [ ] Рендер у пациента безопасный (без raw HTML/XSS).
- [ ] Загрузка медиа работает с лимитами и проверкой MIME.
- [ ] Секции/статусы контента управляются и корректно фильтруются.
- [ ] Новости и мотивация читаются из БД и управляются из doctor UI.
- [ ] Все новые/изменённые функции покрыты тестами (unit/integration/e2e по шагам).
- [ ] `pnpm run ci` проходит.

---

## Новая рабочая версия плана (для auto-агента)

### Цель этапа
Перевести CMS-контур webapp на управляемый Markdown+media workflow, убрать неоднозначности в хранении/рендеринге контента и ввести детерминированные правила публикации/видимости.

### Зона изменений этапа
- Только `apps/webapp` (модули контента, doctor/patient страницы контента, API media, миграции, тесты, модульная документация).
- Не менять integrator, deploy-скрипты, инфраструктурные документы вне `docs/FULL_DEV_PLAN/PLANS/STAGE_10_CMS/PLAN.md`.

### Последовательность действий для автоагента

#### Шаг 10.1 — Контракт хранения Markdown в `content_pages`
1. **Цель шага**: сделать `body_md` основным источником контента.
2. **Точная область изменений**: `apps/webapp/migrations/*`, `apps/webapp/src/infra/repos/pgContentPages.ts`, `apps/webapp/src/app/app/doctor/content/actions.ts`, `apps/webapp/src/modules/content-catalog/service.ts`.
3. **Конкретные действия**:
   - добавить отдельную миграцию для `body_md` (без изменения старых миграций);
   - обновить `ContentPageRow` и SQL-мэппинг в `pgContentPages.ts`;
   - перевести сохранение doctor form на `body_md`;
   - оставить `body_html` только как legacy fallback чтения.
4. **Что проверить и при необходимости изменить (сущности)**:
   - тип `ContentPageRow`, методы `listBySection/getBySlug/getById/listAll/upsert`;
   - server action `saveContentPage`;
   - резолвер `createContentCatalogResolver`.
5. **Проверки после шага**:
   - новые записи содержат `body_md`;
   - старые записи без `body_md` остаются читаемыми.
6. **Критерий успешного выполнения шага**: чтение/запись контента стабильно работает через `body_md`.
7. **Тесты**:
   - обновить `apps/webapp/src/modules/content-catalog/service.test.ts`;
   - добавить unit/integration тесты для `doctor/content/actions`;
   - e2e: не требуется.
8. **Обновление документации**: обновить `apps/webapp/src/modules/content-catalog/content-catalog.md`.

#### Шаг 10.2 — Doctor UI редактора Markdown
1. **Цель шага**: заменить raw HTML textarea на Markdown editor + preview.
2. **Точная область изменений**: `apps/webapp/src/app/app/doctor/content/ContentForm.tsx`, новые компоненты `apps/webapp/src/shared/ui/markdown/*`, `apps/webapp/package.json`.
3. **Конкретные действия**:
   - подключить markdown render stack;
   - выделить `MarkdownEditor` и `MarkdownPreview`;
   - изменить `ContentForm` на поле `body_md` без изменения остальных полей формы.
4. **Что проверить и при необходимости изменить (сущности)**:
   - компонент `ContentForm`;
   - новые UI-компоненты markdown;
   - сериализация `FormData` в doctor форме.
5. **Проверки после шага**:
   - preview соответствует вводу;
   - при submit отправляется `body_md`.
6. **Критерий успешного выполнения шага**: доктор редактирует контент без ручного HTML.
7. **Тесты**:
   - component test `MarkdownEditor`;
   - test формы на отправку `body_md`;
   - e2e: не требуется.
8. **Обновление документации**: обновить комментарии/описание CMS-формы в модульной документации.

#### Шаг 10.3 — Безопасный рендер Markdown у пациента
1. **Цель шага**: исключить XSS при показе контента.
2. **Точная область изменений**: `apps/webapp/src/app/app/patient/content/[slug]/page.tsx`, `apps/webapp/src/shared/ui/markdown/MarkdownContent.tsx`, `apps/webapp/src/modules/content-catalog/service.ts`.
3. **Конкретные действия**:
   - внедрить единый `MarkdownContent` для patient page;
   - запретить raw HTML режимы рендера;
   - сохранить поддержку `videoUrl/videoType`.
4. **Что проверить и при необходимости изменить (сущности)**:
   - patient route `/app/patient/content/[slug]`;
   - markdown renderer component;
   - типы данных content-catalog.
5. **Проверки после шага**:
   - XSS payload не исполняется;
   - базовые markdown-блоки отображаются корректно.
6. **Критерий успешного выполнения шага**: пациент видит форматированный и безопасный контент.
7. **Тесты**:
   - unit тесты `MarkdownContent` (XSS + markdown cases);
   - обновить `content-catalog/service.test.ts`;
   - e2e: не требуется.
8. **Обновление документации**: обновить `apps/webapp/src/app/app/patient/content/content.md`.

#### Шаг 10.4 — API и UI загрузки медиа для CMS
1. **Цель шага**: дать врачу управляемый upload с лимитами и валидацией.
2. **Точная область изменений**: `apps/webapp/migrations/*`, `apps/webapp/src/app/api/media/upload/route.ts` (новый), `apps/webapp/src/app/api/media/[id]/route.ts`, `apps/webapp/src/infra/repos/*media*`, `apps/webapp/src/shared/ui/markdown/MediaUploader.tsx`.
3. **Конкретные действия**:
   - добавить схему `media_files`;
   - реализовать `POST /api/media/upload` (multipart, MIME allowlist, 50MB limit);
   - доработать `GET /api/media/[id]` для выдачи файла/ссылки;
   - интегрировать `MediaUploader` с markdown editor.
4. **Что проверить и при необходимости изменить (сущности)**:
   - API routes media;
   - media repository и типы DTO;
   - CMS UI вставки изображения/файла.
5. **Проверки после шага**:
   - большие/запрещённые файлы отклоняются;
   - валидные файлы загружаются и вставляются в markdown.
6. **Критерий успешного выполнения шага**: медиа-поток работает end-to-end из doctor CMS.
7. **Тесты**:
   - integration tests API upload;
   - unit tests `MediaUploader`;
   - e2e: обязателен 1 сценарий upload+publish.
8. **Обновление документации**: обновить `apps/webapp/src/app/api/api.md` (контракт media endpoints).

#### Шаг 10.5 — Секции, публикация, архив и soft-delete контента
1. **Цель шага**: сделать правила видимости контента однозначными.
2. **Точная область изменений**: `apps/webapp/src/app/app/doctor/content/page.tsx`, `apps/webapp/src/app/app/doctor/content/actions.ts`, `apps/webapp/src/infra/repos/pgContentPages.ts`, при необходимости новая миграция статусов.
3. **Конкретные действия**:
   - зафиксировать поля/правила статусов (`is_published`, `archived_at`, `deleted_at`);
   - добавить doctor UI-действия publish/unpublish/archive/restore/soft-delete;
   - в patient страницах показывать только опубликованные и неархивные/неудалённые записи.
4. **Что проверить и при необходимости изменить (сущности)**:
   - таблица `content_pages` и SQL-фильтры;
   - doctor content list page;
   - patient pages `/app/patient/lessons`, `/app/patient/content/[slug]`.
5. **Проверки после шага**:
   - архив/soft-delete скрывает запись у пациента;
   - восстановление возвращает запись в выдачу.
6. **Критерий успешного выполнения шага**: правила видимости выполняются одинаково во всех точках чтения.
7. **Тесты**:
   - unit/integration тесты репозитория по статусам;
   - integration тест doctor actions;
   - e2e: не требуется.
8. **Обновление документации**: обновить `content-catalog.md` и `patient/content/content.md` правилами видимости.

#### Шаг 10.6 — Новости и мотивация на home пациента
1. **Цель шага**: убрать hardcoded блоки home и перейти на данные из БД.
2. **Точная область изменений**: `apps/webapp/src/app/app/patient/home/PatientHomeNewsSection.tsx`, `apps/webapp/src/app/app/patient/home/PatientHomeMotivationSection.tsx`, `apps/webapp/src/modules/patient-home/*`, `apps/webapp/src/app/app/doctor/content/news/*` (новый раздел), новая миграция news/quotes.
3. **Конкретные действия**:
   - добавить таблицы news/quotes;
   - реализовать сервис чтения новости и цитаты дня;
   - добавить doctor CRUD управления этими сущностями;
   - инкрементировать просмотры новости только при фактическом показе.
4. **Что проверить и при необходимости изменить (сущности)**:
   - компоненты patient home;
   - сервисы/репозитории patient-home;
   - doctor CMS-экран управления новостями/цитатами.
5. **Проверки после шага**:
   - пациент видит только активные сущности;
   - врач может управлять публикацией.
6. **Критерий успешного выполнения шага**: home-блоки полностью управляются из CMS.
7. **Тесты**:
   - unit тесты patient-home сервиса;
   - integration тесты doctor CRUD;
   - e2e: обязателен сценарий publish news -> visible on patient home.
8. **Обновление документации**: обновить модульную документацию `apps/webapp/src/modules/patient-home/`.

### Финальный критерий этапа 10
- Все шаги 10.1–10.6 закрыты с указанными тестами.
- Все новые и изменённые функции покрыты тестами.
- `pnpm run ci` проходит.

---

## Статус реализации (auto-агент)

- Выполнено по коду (в т.ч. нумерация миграций: в репозитории уже был `026_…`, поэтому `body_md` → `027_content_pages_markdown.sql`, медиа → `028`, статусы CMS → `029`, новости → `030`; шаги 10.1–10.6 закрыты).
- Чеклист «Общий критерий завершения этапа 10» в архивной части файла выше можно считать выполненным по текущей реализации.
