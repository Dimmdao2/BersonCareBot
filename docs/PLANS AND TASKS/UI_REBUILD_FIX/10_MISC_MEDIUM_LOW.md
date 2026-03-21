# Fix 10 (MEDIUM/LOW): Сборник мелких исправлений

## Задачи

### 10.1: Seed-скрипт — обернуть в транзакцию

**Файл:** `apps/webapp/scripts/seed-content-pages.mjs`

Обернуть цикл upsert в `BEGIN`/`COMMIT`:

```js
async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const p of pages) {
      await client.query(
        `INSERT INTO content_pages ...`,
        [...]
      );
    }
    await client.query("COMMIT");
    console.log(`Seeded ${pages.length} content pages.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  await pool.end();
}
```

### 10.2: Catch-блоки в сервисах — добавить console.error

**Файлы:**
- `apps/webapp/src/modules/lessons/service.ts`
- `apps/webapp/src/modules/emergency/service.ts`
- `apps/webapp/src/modules/content-catalog/service.ts`

В каждом `catch` блоке добавить:
```ts
} catch (err) {
  console.error("content DB fallback:", err);
}
```

### 10.3: ChannelLinksBlock — empty state

**Файл:** `apps/webapp/src/app/app/patient/profile/ChannelLinksBlock.tsx`

После `const cards = channelCards.filter(...)`:

```tsx
if (cards.length === 0) {
  return <p className="empty-state">Нет доступных каналов.</p>;
}
```

### 10.4: settings redirect — анонимный пользователь

**Файл:** `apps/webapp/src/app/app/settings/page.tsx`

**Заменить:**
```ts
const target = session?.user.role === "client" ? "/app/patient/profile" : "/app/doctor";
```

**На:**
```ts
if (!session) redirect("/app");
const target = session.user.role === "client" ? "/app/patient/profile" : "/app/doctor";
```

### 10.5: dev:doctor — добавить кнопку

**Файл:** `apps/webapp/src/app/app/page.tsx`

Рядом с кнопкой "Как врач / админ" добавить:
```tsx
<Link id="app-entry-dev-login-doctor-role" href="/app?t=dev:doctor" className="button">
  Как специалист
</Link>
```

## Верификация

1. `pnpm run ci` — без ошибок.
