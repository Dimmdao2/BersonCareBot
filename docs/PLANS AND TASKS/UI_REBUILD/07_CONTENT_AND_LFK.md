# Этап 7: Контентные страницы, ЛФК, баг dev-bypass

**Задачи:** P-16, P-17, P-18

## Цель

Подготовить видеоплеер для контентных страниц. Добавить форму создания ЛФК-комплекса. Исправить баг dev-bypass.

## Шаги

### Шаг 7.1: Видеоплеер на контентных страницах (P-16)

**Файл:** `apps/webapp/src/modules/content-catalog/types.ts`

Убедиться, что тип `ContentStubItem` содержит `videoSource?`:
- Если да — использовать его.
- Если нет — добавить поле `videoUrl?: string`.

**Файл:** `apps/webapp/src/modules/content-catalog/catalog.ts`

Для записи `test-video` — добавить тестовый videoUrl (если есть env.MEDIA_TEST_VIDEO_URL — подставить).

**Файл:** `apps/webapp/src/app/app/patient/content/[slug]/page.tsx`

**Найти:**
```tsx
<section id={`patient-content-video-section-${slug}`} className="stack" style={{ marginTop: "1rem" }}>
  <h3>Видео</h3>
  <img
    src="https://placehold.co/640x360?text=Video"
    alt=""
    style={{ maxWidth: "100%", height: "auto", borderRadius: "8px" }}
    width={640}
    height={360}
  />
</section>
```

**Заменить на:**
```tsx
{item.videoSource?.url ? (
  <section id={`patient-content-video-section-${slug}`} className="stack" style={{ marginTop: "1rem" }}>
    <h3>Видео</h3>
    {item.videoSource.type === "youtube" ? (
      <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: 8 }}>
        <iframe
          src={item.videoSource.url}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={item.title}
        />
      </div>
    ) : (
      <video
        controls
        preload="metadata"
        style={{ maxWidth: "100%", borderRadius: 8 }}
      >
        <source src={item.videoSource.url} />
      </video>
    )}
  </section>
) : (
  <section id={`patient-content-video-section-${slug}`} className="stack" style={{ marginTop: "1rem" }}>
    <p className="empty-state">Видео будет добавлено в ближайшее время.</p>
  </section>
)}
```

### Шаг 7.2: Форма создания ЛФК-комплекса (P-17)

**Файл:** `apps/webapp/src/app/app/patient/diary/lfk/actions.ts`

Добавить action:

```tsx
export async function createLfkComplex(formData: FormData) {
  const session = await requirePatientAccess();
  const title = (formData.get("complexTitle") as string)?.trim();
  if (!title) return;
  const deps = buildAppDeps();
  await deps.diaries.createLfkComplex({
    userId: session.user.userId,
    title,
  });
  revalidatePath("/app/patient/diary/lfk");
}
```

**Файл:** `apps/webapp/src/app/app/patient/diary/lfk/page.tsx`

В блоке, где показывается пустое состояние (нет комплексов), заменить заглушку на форму:

**Найти:**
```tsx
{complexes.length === 0 ? (
  <p className="empty-state">{EMPTY_STATE_PLACEHOLDER}</p>
) : (
```

**Заменить на:**
```tsx
{complexes.length === 0 ? (
  <div className="stack" style={{ gap: 12 }}>
    <p style={{ fontSize: "0.9rem", color: "#5f6f86" }}>
      Создайте комплекс упражнений, чтобы начать отслеживать занятия.
    </p>
    <form action={createLfkComplex} className="stack" style={{ gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          name="complexTitle"
          className="auth-input"
          placeholder="Название комплекса"
          required
        />
        <button type="submit" className="button">Создать</button>
      </div>
    </form>
  </div>
) : (
```

Добавить импорт `createLfkComplex` из `./actions`.

### Шаг 7.3: Баг dev-bypass (P-18)

**Файл:** `apps/webapp/src/app/app/page.tsx`

**Найти:**
```tsx
<Link id="app-entry-dev-login-doctor" href="/app?t=dev:client" className="button">
  Как врач / админ
</Link>
```

**Заменить на:**
```tsx
<Link id="app-entry-dev-login-doctor" href="/app?t=dev:admin" className="button">
  Как врач / админ
</Link>
```

## Верификация

1. `pnpm run ci` — без ошибок.
2. Контентная страница с videoUrl показывает iframe/video вместо placeholder.
3. Контентная страница без videoUrl показывает текст «Видео будет добавлено».
4. На странице ЛФК при отсутствии комплексов — форма создания комплекса.
5. Создание комплекса работает → появляется в списке → форма «Отметить занятие» появляется.
6. Dev-bypass кнопка «Как врач / админ» ведёт на `?t=dev:admin`.
