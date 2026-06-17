"use client";

import { AdminPlatformSubscriberStatsClient } from "./AdminPlatformSubscriberStatsClient";

/** Обёртка для вкладки «Приложение» — рендерит статистику подписчиков
 * с периодом по умолчанию (неделя). Перенесено из вкладки «Клиенты» (AN-11):
 * подписчики приложения (ПП) — не клиническая база, а аудитория приложения.
 */
const DEFAULT_PERIOD = { preset: "week" as const, customFrom: "", customTo: "" };

export function SubscriberStatsAppTabWrapper() {
  return (
    <AdminPlatformSubscriberStatsClient
      period={DEFAULT_PERIOD}
      ready={true}
    />
  );
}
