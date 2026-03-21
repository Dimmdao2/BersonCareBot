# Этап 9 (P2): Базовая структура контентных разделов в БД

**Задачи:** P-23

**Зависимости:** нет (можно выполнять параллельно с этапами 1–7, после этапа 8).

## Цель

Перевести контент (уроки, скорая помощь) из hardcoded массивов в БД. Фиксированная структура разделов, без конструктора. Предусмотреть расширение под файлы и видео.

## Текущее состояние

| Компонент | Данные | Проблема |
|-----------|--------|----------|
| `catalog.ts` | 7 STUB_ENTRIES | Placeholder-тексты, в коде |
| `lessons/service.ts` | 3 урока | Дублируют slug из каталога, в коде |
| `emergency/service.ts` | 3 темы | Дублируют slug из каталога, в коде |
| БД | Нет таблицы контента | Нельзя редактировать без деплоя |

## Шаги

### Шаг 9.1: Миграция — таблица content_pages

**Создать файл:** `apps/webapp/migrations/013_content_pages.sql`

```sql
CREATE TABLE IF NOT EXISTS content_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  video_url TEXT,
  video_type TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(section, slug)
);

CREATE INDEX IF NOT EXISTS idx_content_pages_section ON content_pages(section);
CREATE INDEX IF NOT EXISTS idx_content_pages_slug ON content_pages(slug);
```

**Разделы (section):**
- `emergency` — скорая помощь
- `lessons` — полезные уроки

В будущем можно добавить `programs`, `courses` и т.д. без изменения схемы.

**Без промежуточных сущностей:** Нет отдельных таблиц для разделов, вложенных структур, медиа-блоков. Всё в одной таблице. Расширение — через добавление колонок или связанной таблицы `content_attachments` позже.

### Шаг 9.2: Seed-скрипт для начального наполнения

**Создать файл:** `apps/webapp/scripts/seed-content-pages.mjs`

```js
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const pages = [
  // Emergency
  { section: "emergency", slug: "back-pain", title: "Острая боль в спине", summary: "Быстрые рекомендации и безопасные первые шаги.", body_html: "", sort_order: 1 },
  { section: "emergency", slug: "neck-pain", title: "Острая боль в шее", summary: "Короткие рекомендации для снижения нагрузки.", body_html: "", sort_order: 2 },
  { section: "emergency", slug: "panic-attack", title: "Паническая атака", summary: "Поддерживающий сценарий с базовым дыханием.", body_html: "", sort_order: 3 },
  // Lessons
  { section: "lessons", slug: "neck-warmup", title: "Разминка для шеи", summary: "Короткая сессия для безопасного старта дня.", body_html: "", sort_order: 1 },
  { section: "lessons", slug: "back-basics", title: "Базовые принципы разгрузки спины", summary: "Объяснение базовых привычек.", body_html: "", sort_order: 2 },
  { section: "lessons", slug: "breathing-reset", title: "Дыхательная пауза при стрессе", summary: "Короткая практика для быстрого восстановления.", body_html: "", sort_order: 3 },
];

async function seed() {
  for (const p of pages) {
    await pool.query(
      `INSERT INTO content_pages (section, slug, title, summary, body_html, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (section, slug) DO UPDATE SET
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         sort_order = EXCLUDED.sort_order,
         updated_at = now()`,
      [p.section, p.slug, p.title, p.summary, p.body_html, p.sort_order]
    );
  }
  console.log(`Seeded ${pages.length} content pages.`);
  await pool.end();
}

seed().catch((e) => { console.error(e); process.exit(1); });
```

Добавить script в `package.json`:
```json
"seed-content": "node scripts/seed-content-pages.mjs"
```

### Шаг 9.3: Создать DB-порт для чтения контента

**Создать файл:** `apps/webapp/src/infra/repos/pgContentPages.ts`

```ts
import { getPool } from "@/infra/db/client";

export type ContentPageRow = {
  id: string;
  section: string;
  slug: string;
  title: string;
  summary: string;
  bodyHtml: string;
  sortOrder: number;
  isPublished: boolean;
  videoUrl: string | null;
  videoType: string | null;
  imageUrl: string | null;
};

export function createPgContentPagesPort() {
  return {
    async listBySection(section: string): Promise<ContentPageRow[]> {
      const pool = getPool();
      const res = await pool.query(
        `SELECT id, section, slug, title, summary, body_html, sort_order, is_published, video_url, video_type, image_url
         FROM content_pages
         WHERE section = $1 AND is_published = true
         ORDER BY sort_order, title`,
        [section]
      );
      return res.rows.map(mapRow);
    },

    async getBySlug(slug: string): Promise<ContentPageRow | null> {
      const pool = getPool();
      const res = await pool.query(
        `SELECT id, section, slug, title, summary, body_html, sort_order, is_published, video_url, video_type, image_url
         FROM content_pages WHERE slug = $1 AND is_published = true`,
        [slug]
      );
      return res.rows[0] ? mapRow(res.rows[0]) : null;
    },

    async listAll(): Promise<ContentPageRow[]> {
      const pool = getPool();
      const res = await pool.query(
        `SELECT id, section, slug, title, summary, body_html, sort_order, is_published, video_url, video_type, image_url
         FROM content_pages ORDER BY section, sort_order, title`
      );
      return res.rows.map(mapRow);
    },

    async upsert(page: Omit<ContentPageRow, "id"> & { id?: string }): Promise<string> {
      const pool = getPool();
      const res = await pool.query(
        `INSERT INTO content_pages (section, slug, title, summary, body_html, sort_order, is_published, video_url, video_type, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (section, slug) DO UPDATE SET
           title = EXCLUDED.title,
           summary = EXCLUDED.summary,
           body_html = EXCLUDED.body_html,
           sort_order = EXCLUDED.sort_order,
           is_published = EXCLUDED.is_published,
           video_url = EXCLUDED.video_url,
           video_type = EXCLUDED.video_type,
           image_url = EXCLUDED.image_url,
           updated_at = now()
         RETURNING id`,
        [page.section, page.slug, page.title, page.summary, page.bodyHtml,
         page.sortOrder, page.isPublished, page.videoUrl, page.videoType, page.imageUrl]
      );
      return res.rows[0].id;
    },
  };
}

function mapRow(row: Record<string, unknown>): ContentPageRow {
  return {
    id: row.id as string,
    section: row.section as string,
    slug: row.slug as string,
    title: row.title as string,
    summary: row.summary as string,
    bodyHtml: (row.body_html as string) ?? "",
    sortOrder: row.sort_order as number,
    isPublished: row.is_published as boolean,
    videoUrl: row.video_url as string | null,
    videoType: row.video_type as string | null,
    imageUrl: row.image_url as string | null,
  };
}
```

Создать in-memory вариант для тестов (массив в памяти).

### Шаг 9.4: Переключить сервисы на чтение из БД

**Файл:** `apps/webapp/src/modules/content-catalog/service.ts`

Заменить `getBaseCatalog()` на вызов `contentPagesPort.getBySlug(slug)`. Для обратной совместимости: если БД недоступна — fallback на статический каталог.

**Файл:** `apps/webapp/src/modules/lessons/service.ts`

Заменить hardcoded массив на `contentPagesPort.listBySection("lessons")`.

**Файл:** `apps/webapp/src/modules/emergency/service.ts`

Заменить hardcoded массив на `contentPagesPort.listBySection("emergency")`.

**Файл:** `apps/webapp/src/app-layer/di/buildAppDeps.ts`

Добавить `contentPagesPort` в deps. Передавать в сервисы.

### Шаг 9.5: Обновить страницу контента

**Файл:** `apps/webapp/src/app/app/patient/content/[slug]/page.tsx`

Адаптировать под новый формат данных из БД:
- `bodyText` → `bodyHtml` (рендерить как HTML через `dangerouslySetInnerHTML` или как текст).
- `videoSource` → `videoUrl` + `videoType`.

## Верификация

1. `pnpm run ci` — без ошибок.
2. `pnpm --dir apps/webapp run migrate` — миграция 013 применяется.
3. `pnpm --dir apps/webapp run seed-content` — seed вставляет записи.
4. Страницы «Полезные уроки» и «Скорая помощь» показывают данные из БД.
5. Страница `content/[slug]` отображает заголовок, текст, видео (если есть) из БД.
6. При пустой БД — fallback на статический каталог (или пустой список).
