# Этап 1: Шапка пациента и боковое меню

**Задачи:** P-01, P-02, P-03

## Цель

Привести шапку и drawer-меню пациента к целевому виду:
- Центр шапки: иконка дома (вместо текста с названием страницы).
- Drawer: осмысленные пункты (профиль, записи, уведомления, выход).
- Название текущей страницы — под шапкой в основном контенте.

## Шаги

### Шаг 1.1: Иконка «домой» в центре шапки (P-01)

**Файл:** `apps/webapp/src/shared/ui/PatientHeader.tsx`

**Найти:**
```tsx
<div className="patient-header__center">
  <Link href="/app/patient" className="patient-header__title" prefetch={false}>
    {title?.trim() ?? "BERSONCARE"}
  </Link>
</div>
```

**Заменить на:**
```tsx
<div className="patient-header__center">
  <Link href="/app/patient" className="patient-header__home-link" prefetch={false} aria-label="Главное меню">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  </Link>
</div>
```

SVG — это lucide-react иконка `House`. Если в проекте позже подключится lucide-react, заменить на `<House size={24} />`.

**Файл:** `apps/webapp/src/shared/ui/PatientHeader.tsx`

Убрать prop `title` из типа `PatientHeaderProps` (больше не нужен в шапке).

### Шаг 1.2: Вынести заголовок страницы в контент (P-01)

**Файл:** `apps/webapp/src/shared/ui/AppShell.tsx`

В варианте `patient` — добавить заголовок `<h1>` над `{children}` в `<main>`:

**Найти (вариант patient):**
```tsx
<main id="app-shell-content" className="content-area">
  {children}
</main>
```

**Заменить на:**
```tsx
<main id="app-shell-content" className="content-area">
  {title && <h1 className="page-title">{title}</h1>}
  {children}
</main>
```

**Файл:** `apps/webapp/src/app/globals.css`

Добавить стиль для `.page-title`:
```css
.page-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #18202c;
}
```

**Файл:** `apps/webapp/src/shared/ui/PatientHeader.tsx`

Убрать передачу `title` в `<PatientHeader>` из `AppShell`:
```tsx
<PatientHeader
  showBack={!!backHref}
  backHref={backHref}
  backLabel={backLabel}
/>
```

### Шаг 1.3: Добавить CSS для иконки дома

**Файл:** `apps/webapp/src/app/globals.css`

Добавить:
```css
.patient-header__home-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--patient-touch);
  padding: 0 8px;
  color: #18202c;
  -webkit-tap-highlight-color: transparent;
  text-decoration: none;
}

.patient-header__home-link:active {
  opacity: 0.7;
}
```

Удалить устаревший стиль `.patient-header__title` (или оставить, если используется где-то ещё — проверить grep).

### Шаг 1.4: Переделать пункты drawer-меню (P-02)

**Файл:** `apps/webapp/src/shared/ui/PatientHeader.tsx`

**Найти:**
```tsx
const MENU_ITEMS: { id: string; label: string; href: string }[] = [
  { id: "cabinet", label: "Профиль", href: "/app/patient/cabinet" },
  { id: "security", label: "Безопасность", href: "/app/settings" },
  { id: "notifications", label: "Настройки уведомлений", href: "/app/settings" },
  { id: "emergency", label: "Связь с поддержкой", href: "/app/patient/emergency" },
  { id: "help", label: "Справка", href: "/app/settings" },
];
```

**Заменить на:**
```tsx
const MENU_ITEMS: { id: string; label: string; href: string }[] = [
  { id: "profile", label: "Мой профиль", href: "/app/patient/profile" },
  { id: "cabinet", label: "Мои записи", href: "/app/patient/cabinet" },
  { id: "notifications", label: "Настройки уведомлений", href: "/app/patient/notifications" },
];
```

### Шаг 1.5: Добавить кнопку «Выход» в drawer (P-03)

**Файл:** `apps/webapp/src/shared/ui/PatientHeader.tsx`

После `{MENU_ITEMS.map(...)}` в drawer-nav добавить разделитель и кнопку logout:

```tsx
<div className="drawer-nav__divider" />
<button
  type="button"
  id="patient-menu-logout"
  className="drawer-nav__link drawer-nav__link--danger"
  onClick={() => {
    close();
    window.location.href = "/api/auth/logout";
  }}
>
  Выйти
</button>
```

**Файл:** `apps/webapp/src/app/globals.css`

Добавить стили:
```css
.drawer-nav__divider {
  height: 1px;
  margin: 8px 16px;
  background: #e5e7eb;
}

.drawer-nav__link--danger {
  color: #dc2626;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
  text-align: left;
  width: 100%;
}
```

### Шаг 1.6: Обновить routePaths

**Файл:** `apps/webapp/src/app-layer/routes/paths.ts`

Добавить:
```ts
profile: "/app/patient/profile",
notifications: "/app/patient/notifications",
```

## Верификация

1. `pnpm run ci` — без ошибок.
2. Шапка показывает иконку дома по центру; клик ведёт на /app/patient.
3. Drawer содержит: «Мой профиль», «Мои записи», «Настройки уведомлений», «Выйти».
4. Кнопка «Выйти» вызывает /api/auth/logout.
5. Название текущей страницы отображается как `<h1>` под шапкой.

## Примечание

Страницы `/app/patient/profile` и `/app/patient/notifications` ещё не существуют. Drawer будет ссылаться на 404 до выполнения этапов 2 и 3. Это допустимо: этапы выполняются последовательно.
