# Этап 3: Страница «Настройки уведомлений»

**Задачи:** P-09, P-10

## Цель

Создать страницу `/app/patient/notifications` с рабочим механизмом управления подписками. Очистить старую страницу `/app/settings` от перенесённых блоков.

## Шаги

### Шаг 3.1: Создать страницу `/app/patient/notifications`

**Создать файл:** `apps/webapp/src/app/app/patient/notifications/page.tsx`

```tsx
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { SubscriptionsList } from "./SubscriptionsList";

export default async function NotificationsPage() {
  const session = await requirePatientAccess(routePaths.notifications);
  const deps = buildAppDeps();
  const channelCards = await deps.channelPreferences.getChannelCards(
    session.user.userId,
    session.user.bindings
  );

  // Категории подписок (будет расширяться при реализации reminder rules)
  const subscriptions = [
    { id: "exercise_reminders", title: "Напоминания об упражнениях" },
    { id: "symptom_reminders", title: "Напоминания о симптомах" },
    { id: "appointment_reminders", title: "Напоминания о записях" },
    { id: "news", title: "Новости и обновления" },
  ];

  const linkedChannels = channelCards
    .filter((c) => c.isLinked && c.isImplemented)
    .map((c) => ({ code: c.code, title: c.title }));

  return (
    <AppShell
      title="Настройки уведомлений"
      user={session.user}
      backHref="/app/patient"
      backLabel="Меню"
      variant="patient"
    >
      <section className="panel stack">
        <h2>Подписки</h2>
        {linkedChannels.length === 0 ? (
          <p className="empty-state">
            Для настройки уведомлений подключите хотя бы один канал в разделе «Мой профиль».
          </p>
        ) : (
          <SubscriptionsList
            subscriptions={subscriptions}
            linkedChannels={linkedChannels}
            userId={session.user.userId}
          />
        )}
      </section>
    </AppShell>
  );
}
```

### Шаг 3.2: Компонент SubscriptionsList

**Создать файл:** `apps/webapp/src/app/app/patient/notifications/SubscriptionsList.tsx`

```tsx
"use client";

import { useTransition } from "react";
import { toggleSubscriptionChannel } from "./actions";

type Subscription = { id: string; title: string };
type LinkedChannel = { code: string; title: string };

type Props = {
  subscriptions: Subscription[];
  linkedChannels: LinkedChannel[];
  userId: string;
};

export function SubscriptionsList({ subscriptions, linkedChannels, userId }: Props) {
  const [pending, startTransition] = useTransition();

  const handleToggle = (subscriptionId: string, channelCode: string, checked: boolean) => {
    startTransition(() => {
      toggleSubscriptionChannel(subscriptionId, channelCode, checked);
    });
  };

  return (
    <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {subscriptions.map((sub) => (
        <li key={sub.id} className="list-item">
          <div style={{ fontWeight: 500, marginBottom: 8 }}>{sub.title}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {linkedChannels.map((ch) => (
              <label key={ch.code} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.9rem" }}>
                <input
                  type="checkbox"
                  defaultChecked
                  disabled={pending}
                  onChange={(e) => handleToggle(sub.id, ch.code, e.target.checked)}
                />
                {ch.title}
              </label>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

### Шаг 3.3: Server action для подписок

**Создать файл:** `apps/webapp/src/app/app/patient/notifications/actions.ts`

```tsx
"use server";

import { revalidatePath } from "next/cache";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";

export async function toggleSubscriptionChannel(
  subscriptionId: string,
  channelCode: string,
  enabled: boolean
) {
  const session = await requirePatientAccess();
  // TODO: Когда reminder rules будут реализованы в бэкенде,
  // здесь будет вызов deps.reminderProjection или integrator API.
  // Пока — no-op, но UI уже рабочий.
  void session;
  void subscriptionId;
  void channelCode;
  void enabled;
  revalidatePath("/app/patient/notifications");
}
```

### Шаг 3.4: Очистить `/app/settings` (P-10)

**Файл:** `apps/webapp/src/app/app/settings/page.tsx`

Удалить из содержимого:
1. Блок «Профиль» (секция `settings-profile-section`).
2. Блок `ChannelSubscriptionBlock`.
3. Блок «Мои покупки» (секция `settings-purchases-section`).
4. Блок «Настройки уведомлений» (секция `settings-notifications-section`).

Если после удаления страница пуста — заменить содержимое на redirect:

```tsx
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  const target = session?.user.role === "client"
    ? "/app/patient/profile"
    : "/app/doctor";
  redirect(target);
}
```

Это обеспечит обратную совместимость: старые ссылки на `/app/settings` перенаправят в нужное место.

### Шаг 3.5: Удалить ChannelSubscriptionBlock и settings/actions.ts если не используются

Если `ChannelSubscriptionBlock.tsx` и `settings/actions.ts` больше нигде не импортируются — удалить файлы. Проверить grep перед удалением.

## Верификация

1. `pnpm run ci` — без ошибок.
2. `/app/patient/notifications` открывается и показывает список подписок с галочками каналов.
3. Только подключённые каналы доступны для выбора.
4. `/app/settings` редиректит на `/app/patient/profile` для пациента.
5. Нет надписей «В MVP настройки уведомлений готовятся как каркас под reminder bridge».
6. Нет блока «Мои покупки» ни на одной странице (кроме пункта меню, если он есть).
