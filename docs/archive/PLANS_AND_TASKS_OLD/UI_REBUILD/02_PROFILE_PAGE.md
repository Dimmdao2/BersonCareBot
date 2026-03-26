# Этап 2: Страница «Мой профиль»

**Задачи:** P-04, P-05, P-06, P-07, P-08

## Цель

Создать новую страницу `/app/patient/profile` с личными данными, привязанными каналами и кнопкой выхода. Убрать из старой страницы `/app/settings` блоки, которые переезжают.

## Шаги

### Шаг 2.1: Создать страницу `/app/patient/profile`

**Создать файл:** `apps/webapp/src/app/app/patient/profile/page.tsx`

Содержимое:

```tsx
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { ProfileForm } from "./ProfileForm";
import { ChannelLinksBlock } from "./ChannelLinksBlock";

export default async function PatientProfilePage() {
  const session = await requirePatientAccess(routePaths.profile);
  const deps = buildAppDeps();
  const channelCards = await deps.channelPreferences.getChannelCards(
    session.user.userId,
    session.user.bindings
  );

  return (
    <AppShell
      title="Мой профиль"
      user={session.user}
      backHref="/app/patient"
      backLabel="Меню"
      variant="patient"
    >
      <section className="panel stack">
        <h2>Личные данные</h2>
        <ProfileForm
          displayName={session.user.displayName}
          phone={session.user.phone ?? null}
          userId={session.user.userId}
        />
      </section>

      <section className="panel stack">
        <h2>Привязанные каналы</h2>
        <ChannelLinksBlock channelCards={channelCards} />
      </section>

      <section className="stack" style={{ marginTop: 16 }}>
        <a href="/api/auth/logout" className="button button--danger-outline">
          Выйти из аккаунта
        </a>
      </section>
    </AppShell>
  );
}
```

### Шаг 2.2: Компонент ProfileForm (P-04, P-05, P-06, P-07, P-08)

**Создать файл:** `apps/webapp/src/app/app/patient/profile/ProfileForm.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateDisplayName } from "./actions";

type Props = {
  displayName: string;
  phone: string | null;
  userId: string;
};

export function ProfileForm({ displayName, phone, userId }: Props) {
  const [name, setName] = useState(displayName);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleSaveName = () => {
    if (!name.trim() || name.trim() === displayName) return;
    setSaved(false);
    startTransition(async () => {
      await updateDisplayName(name.trim());
      setSaved(true);
    });
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      {/* ФИО */}
      <div>
        <label className="eyebrow" htmlFor="profile-name" style={{ display: "block", marginBottom: 4 }}>
          Имя
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            id="profile-name"
            type="text"
            className="auth-input"
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
            disabled={pending}
          />
          <button
            type="button"
            className="button"
            onClick={handleSaveName}
            disabled={pending || !name.trim() || name.trim() === displayName}
          >
            {pending ? "..." : "Сохранить"}
          </button>
        </div>
        {saved && <p style={{ color: "#16a34a", fontSize: "0.875rem", margin: "4px 0 0" }}>Сохранено</p>}
      </div>

      {/* Телефон */}
      <div>
        <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>Телефон</span>
        {phone ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>{phone}</span>
            <Link href={`/app/patient/bind-phone?next=/app/patient/profile`} className="button button--ghost" style={{ fontSize: "0.875rem" }}>
              Изменить
            </Link>
          </div>
        ) : (
          <Link href={`/app/patient/bind-phone?next=/app/patient/profile`} className="button">
            Привязать номер
          </Link>
        )}
      </div>

      {/* Email (заглушка) */}
      <div>
        <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>Email</span>
        <input
          type="email"
          className="auth-input"
          placeholder="email@example.com"
          disabled
        />
        <p className="empty-state" style={{ fontSize: "0.8rem", margin: "4px 0 0" }}>
          Привязка email будет доступна в следующем обновлении.
        </p>
      </div>
    </div>
  );
}
```

### Шаг 2.3: Server action для обновления имени (P-06)

**Создать файл:** `apps/webapp/src/app/app/patient/profile/actions.ts`

```tsx
"use server";

import { revalidatePath } from "next/cache";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function updateDisplayName(newName: string) {
  const session = await requirePatientAccess();
  if (!newName.trim()) return;
  // Обновить display_name в platform_users
  await buildAppDeps().userProjection.updateDisplayName(
    session.user.userId,
    newName.trim()
  );
  revalidatePath("/app/patient/profile");
}
```

**Требуется бэкенд:** Добавить метод `updateDisplayName(userId, name)` в `userProjectionPort`. Это SQL:
```sql
UPDATE platform_users SET display_name = $2 WHERE id = $1
```

Если метод ещё не существует:
1. Добавить в порт `pgUserProjectionPort` метод `updateDisplayName`.
2. Добавить in-memory вариант в `inMemoryUserProjectionPort`.
3. Пробросить через `buildAppDeps().userProjection`.

### Шаг 2.4: Компонент ChannelLinksBlock (P-04)

**Создать файл:** `apps/webapp/src/app/app/patient/profile/ChannelLinksBlock.tsx`

```tsx
"use client";

import type { ChannelCard } from "@/modules/channel-preferences/types";

type Props = { channelCards: ChannelCard[] };

const CHANNEL_ICONS: Record<string, string> = {
  telegram: "✈",
  max: "M",
  vk: "VK",
};

export function ChannelLinksBlock({ channelCards }: Props) {
  const cards = channelCards.filter((c) => c.isImplemented);

  return (
    <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {cards.map((card) => (
        <li key={card.code} className="list-item" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.25rem", width: 28, textAlign: "center" }}>
              {CHANNEL_ICONS[card.code] ?? "?"}
            </span>
            <span style={{ fontWeight: 500 }}>{card.title}</span>
          </div>
          {card.isLinked ? (
            <span className="status-pill status-pill--available">Подключён</span>
          ) : (
            <a
              href={card.openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button"
              style={{ fontSize: "0.875rem", padding: "8px 12px" }}
            >
              Подключить
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
```

Когда подключится lucide-react, заменить текстовые символы на `<Send />` (Telegram), иконку MAX и т.д.

### Шаг 2.5: Добавить стиль для кнопки выхода

**Файл:** `apps/webapp/src/app/globals.css`

```css
.button--danger-outline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  border-radius: var(--patient-radius, 12px);
  border: 1px solid #fca5a5;
  background: transparent;
  color: #dc2626;
  font-size: 0.9375rem;
  font-weight: 500;
  text-align: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.button--danger-outline:active {
  background: #fef2f2;
}
```

### Шаг 2.6: Обновить routePaths

Добавить `profile` если не добавлен в этапе 1.

## Верификация

1. `pnpm run ci` — без ошибок.
2. Страница `/app/patient/profile` открывается и показывает: имя (редактируемое), телефон (с кнопкой «Изменить» или «Привязать»), email (disabled), каналы (строки с иконкой и статусом), кнопку «Выйти».
3. Сохранение имени работает (server action → БД → revalidate).
4. Кнопка «Выйти» ведёт на `/api/auth/logout`.
5. Роль нигде не отображается.
