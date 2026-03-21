# Этап 10 (P3): Интерфейс редактирования контента для администратора

**Задачи:** P-24

**Зависимости:** этап 9 (таблица content_pages в БД).

## Цель

Дать администратору/инструктору интерфейс для редактирования контентных страниц: заголовок, текст, summary. Без полноценного конструктора — простая форма.

## Шаги

### Шаг 10.1: Страница списка контента

**Создать файл:** `apps/webapp/src/app/app/doctor/content/page.tsx`

Доступ: `requireDoctorAccess()`.

Содержимое:
- Таблица всех `content_pages` (из `contentPagesPort.listAll()`).
- Колонки: раздел, заголовок, slug, опубликован, действия (редактировать).
- Кнопка «Редактировать» → `/app/doctor/content/edit/[id]`.
- Кнопка «Создать страницу» → `/app/doctor/content/new`.

### Шаг 10.2: Страница редактирования

**Создать файл:** `apps/webapp/src/app/app/doctor/content/edit/[id]/page.tsx`

Доступ: `requireDoctorAccess()`.

Форма:
- `title` (input text)
- `summary` (textarea, 2 строки)
- `body_html` (textarea, 10+ строк — простой текст/HTML)
- `section` (select: emergency / lessons)
- `slug` (input text, readonly для существующих)
- `sort_order` (input number)
- `is_published` (checkbox)
- `video_url` (input text, опционально)
- Кнопка «Сохранить»

Server action: `saveContentPage` → `contentPagesPort.upsert(...)`.

### Шаг 10.3: Страница создания новой страницы

**Создать файл:** `apps/webapp/src/app/app/doctor/content/new/page.tsx`

Та же форма, что и редактирование, но `slug` редактируемый. После сохранения → redirect на список.

### Шаг 10.4: Server actions

**Создать файл:** `apps/webapp/src/app/app/doctor/content/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function saveContentPage(formData: FormData) {
  await requireDoctorAccess();
  const deps = buildAppDeps();
  
  const data = {
    section: (formData.get("section") as string)?.trim() || "lessons",
    slug: (formData.get("slug") as string)?.trim() || "",
    title: (formData.get("title") as string)?.trim() || "",
    summary: (formData.get("summary") as string)?.trim() || "",
    bodyHtml: (formData.get("body_html") as string) || "",
    sortOrder: parseInt(formData.get("sort_order") as string, 10) || 0,
    isPublished: formData.get("is_published") === "on",
    videoUrl: (formData.get("video_url") as string)?.trim() || null,
    videoType: null as string | null,
    imageUrl: null as string | null,
  };

  if (!data.slug || !data.title) return;

  // Определить тип видео
  if (data.videoUrl) {
    data.videoType = data.videoUrl.includes("youtube") || data.videoUrl.includes("youtu.be")
      ? "youtube"
      : "url";
  }

  await deps.contentPages.upsert(data);
  revalidatePath("/app/doctor/content");
  revalidatePath(`/app/patient/content/${data.slug}`);
  revalidatePath("/app/patient/lessons");
  revalidatePath("/app/patient/emergency");
}
```

### Шаг 10.5: Добавить в навигацию врача

**Файл:** `apps/webapp/src/shared/ui/DoctorNavigation.tsx`

Добавить пункт:
```ts
{ id: "content", label: "Контент", href: "/app/doctor/content" },
```

### Шаг 10.6: Пробросить contentPages в buildAppDeps

**Файл:** `apps/webapp/src/app-layer/di/buildAppDeps.ts`

```ts
const contentPagesPort = env.DATABASE_URL
  ? createPgContentPagesPort()
  : inMemoryContentPagesPort;

// В return:
contentPages: contentPagesPort,
```

## Предусмотреть расширение

Архитектура позволяет в будущем:
1. Добавить `content_attachments` таблицу для файлов/видео (P-25).
2. Заменить textarea на rich-text editor (TipTap, Lexical).
3. Добавить preview перед публикацией.
4. Добавить drag-and-drop сортировку.

На этом этапе — только базовая форма без усложнений.

## Верификация

1. `pnpm run ci` — без ошибок.
2. `/app/doctor/content` — список всех страниц контента из БД.
3. Редактирование страницы — сохраняет title, summary, body_html в БД.
4. Создание новой страницы — вставляет в БД.
5. Изменения видны на клиентских страницах (уроки, скорая помощь, контент) после сохранения.
6. Доступ только для doctor/admin.
