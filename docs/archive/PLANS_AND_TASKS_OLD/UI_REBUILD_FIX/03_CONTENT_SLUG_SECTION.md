# Fix 03 (HIGH): Slug collision, section edit dupe, валидация

## Проблемы

1. `getBySlug` фильтрует только по slug, не по section — при дублях slug в разных секциях результат недетерминирован.
2. При редактировании контента section можно менять — это создаёт дубликат вместо обновления.
3. Нет серверной валидации section (whitelist) и slug (формат).

## Файлы

- `apps/webapp/src/infra/repos/pgContentPages.ts`
- `apps/webapp/src/app/app/doctor/content/actions.ts`
- `apps/webapp/src/app/app/doctor/content/ContentForm.tsx`

## Шаги

### Шаг 3.1: getBySlug — добавить ORDER BY и LIMIT

**Файл:** `apps/webapp/src/infra/repos/pgContentPages.ts`

**Найти:**
```ts
    async getBySlug(slug) {
      const pool = getPool();
      const res = await pool.query(
        `SELECT id, section, slug, title, summary, body_html, sort_order, is_published, video_url, video_type, image_url
         FROM content_pages WHERE slug = $1 AND is_published = true`,
        [slug]
      );
      return res.rows[0] ? mapRow(res.rows[0]) : null;
    },
```

**Заменить на:**
```ts
    async getBySlug(slug) {
      const pool = getPool();
      const res = await pool.query(
        `SELECT id, section, slug, title, summary, body_html, sort_order, is_published, video_url, video_type, image_url
         FROM content_pages WHERE slug = $1 AND is_published = true
         ORDER BY section LIMIT 1`,
        [slug]
      );
      return res.rows[0] ? mapRow(res.rows[0]) : null;
    },
```

### Шаг 3.2: section — сделать readonly при редактировании

**Файл:** `apps/webapp/src/app/app/doctor/content/ContentForm.tsx`

Найти `<select>` для section. Если `page` (редактирование) — сделать disabled + hidden input:

**Найти `name="section"` select и заменить на:**
```tsx
{page ? (
  <>
    <input type="hidden" name="section" value={page.section} />
    <input type="text" className="auth-input" value={page.section} disabled />
  </>
) : (
  <select id="content-section" name="section" className="auth-input" defaultValue="lessons">
    <option value="lessons">lessons</option>
    <option value="emergency">emergency</option>
  </select>
)}
```

### Шаг 3.3: Валидация section и slug в server action

**Файл:** `apps/webapp/src/app/app/doctor/content/actions.ts`

**После строки с `const slug = ...` добавить:**
```ts
  const ALLOWED_SECTIONS = ["lessons", "emergency"];
  if (!ALLOWED_SECTIONS.includes(section)) return;
  if (!/^[a-z0-9-]+$/.test(slug)) return;
```

## Верификация

1. `pnpm run ci` — без ошибок.
2. getBySlug при дублях slug → детерминированный результат.
3. При редактировании section заблокирован.
4. Произвольный section или slug с пробелами → отклоняется.
