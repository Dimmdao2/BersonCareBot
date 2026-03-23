# Этап 10: CMS и контент

> Приоритет: P2
> Зависимости: Этап 2 (дизайн-система)
> Риск: средний (WYSIWYG XSS, медиа-хранение)

---

## Подэтап 10.1: Установка TipTap

**Задача:** подключить WYSIWYG-редактор.

**Файлы:**
- `apps/webapp/package.json`

**Действия:**
1. Установить: `pnpm --filter webapp add @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image @tiptap/extension-placeholder`.
2. Создать компонент-обёртку `RichTextEditor.tsx`:
   - Toolbar: жирный, курсив, заголовки H2/H3, список, ссылка, изображение.
   - Минималистичный стиль, согласованный с дизайн-системой.
   - `value` / `onChange` props.
3. Client component (TipTap — client-only).

**Критерий:**
- Редактор рендерится.
- Базовое форматирование работает.

---

## Подэтап 10.2: ContentForm с WYSIWYG

**Задача:** заменить textarea на WYSIWYG в форме контента.

**Файлы:**
- `apps/webapp/src/app/app/doctor/content/ContentForm.tsx`

**Действия:**
1. Заменить `<textarea>` на `<RichTextEditor>`.
2. Сохранение: HTML из редактора → `body_html` в `content_pages`.
3. **Санитизация:** на сервере при сохранении — strip опасных тегов (script, iframe, on*). Использовать simple allowlist (p, h2, h3, ul, ol, li, a, img, strong, em, br).
4. При отображении контента клиенту: `dangerouslySetInnerHTML` с уже санитизированным HTML.

**Критерий:**
- Контент создаётся с форматированием.
- При сохранении — опасные теги удалены.
- Контент корректно отображается у клиента.

---

## Подэтап 10.3: Медиа-загрузка

**Задача:** загрузка файлов, видео, фото.

**Файлы:**
- Миграция: `apps/webapp/migrations/023_media_files.sql`
- API route: `/api/media/upload`
- Компонент: `MediaUploader.tsx`

**Действия:**
1. Миграция:
   ```sql
   CREATE TABLE IF NOT EXISTS media_files (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     original_name TEXT NOT NULL,
     stored_path TEXT NOT NULL,
     mime_type TEXT NOT NULL,
     size_bytes BIGINT NOT NULL,
     uploaded_by UUID NOT NULL REFERENCES platform_users(id),
     tags TEXT[] DEFAULT '{}',
     description TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```
2. Хранение: S3-совместимое хранилище (`S3_ENDPOINT=https://fs.bersonservices.ru`, указано в env).
3. API: `POST /api/media/upload` — multipart form data, лимит 50MB.
4. Обновить `GET /api/media/[id]` — отдача файла.
5. Компонент `MediaUploader`: drag-and-drop или кнопка выбора файла.
6. Интеграция с TipTap: кнопка «Вставить изображение» → upload → вставка URL.

**Критерий:**
- Файлы загружаются и сохраняются.
- Изображения отображаются в редакторе и на странице контента.
- Лимит размера работает.

---

## Подэтап 10.4: Разделы контента

**Задача:** управление секциями (разделами) контента.

**Файлы:**
- `apps/webapp/src/app/app/doctor/content/page.tsx`
- `apps/webapp/src/modules/content-catalog/`

**Действия:**
1. На странице контента: список секций (группировка страниц).
2. Создание/переименование/удаление секции.
3. Внутри секции: список страниц, drag-and-drop сортировка (или стрелки).
4. Архивация: страница скрывается от клиентов но остаётся в БД.
5. Пометка «удалена» — soft-delete.
6. В блоке «Уроки» у клиента: отображать только опубликованные страницы из активных секций.

**Критерий:**
- Секции создаются/редактируются.
- Страницы внутри секций сортируются.
- Архивация и soft-delete работают.

---

## Подэтап 10.5: Новости и мотивашки

**Задача:** управление новостями и мотивационными цитатами.

**Файлы:**
- Миграция: `apps/webapp/migrations/024_news_motivational.sql`
- Модуль: `apps/webapp/src/modules/news/`
- UI doctor + patient

**Действия:**
1. Миграции:
   ```sql
   CREATE TABLE IF NOT EXISTS news_items (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     title TEXT NOT NULL,
     body TEXT NOT NULL,
     importance TEXT NOT NULL DEFAULT 'normal' CHECK (importance IN ('normal', 'important')),
     is_visible BOOLEAN NOT NULL DEFAULT false,
     created_by UUID NOT NULL REFERENCES platform_users(id),
     views_count INT NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );

   CREATE TABLE IF NOT EXISTS motivational_quotes (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     text TEXT NOT NULL,
     is_active BOOLEAN NOT NULL DEFAULT true,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```
2. Doctor UI: CRUD для новостей (показать/скрыть, важность), CRUD для мотивашек.
3. Patient UI (главная):
   - Новости: InfoBlock, красный при `importance = 'important'`. Видим только если `is_visible = true`.
   - При открытии главной → инкремент `views_count`.
   - Мотивашка: случайная цитата, меняется ежедневно (seed по дате).

**Критерий:**
- Врач управляет новостями и мотивашками.
- Клиент видит активную новость и мотивашку.
- Статистика просмотров у врача.

---

## Общий критерий завершения этапа 10

- [ ] TipTap WYSIWYG работает.
- [ ] Контент создаётся с форматированием, санитизированным HTML.
- [ ] Медиа загружается и отображается.
- [ ] Секции контента управляемы.
- [ ] Новости и мотивашки работают.
- [ ] `pnpm run ci` проходит.
