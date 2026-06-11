import type { ComponentType } from "react";
import type { CommunicationsTabId } from "./doctorCommunicationsTabs";

/** Стандартные пропы, которые шелл передаёт каждому компоненту-табу. */
export type CommunicationsTabProps = {
  /** URL-параметры, специфичные для этого таба (напр. { id: "req-123" } для intake). */
  deepLinkParams: Record<string, string>;
  /** Вызывается табом при изменении deep-link параметра. null — удалить из URL. */
  onDeepLinkChange: (key: string, value: string | null) => void;
  /** SSR-данные, предзагруженные серверной страницей (типизация в каждом табе своя). */
  initialData?: unknown;
};

export type CommunicationsTabRegistryEntry = {
  id: CommunicationsTabId;
  /** Фабрика динамического импорта. Возвращает компонент с CommunicationsTabProps. */
  loader: () => Promise<{ default: ComponentType<CommunicationsTabProps> }>;
  /** URL-ключи, которые этот таб читает/пишет (напр. ["id"] для intake, ["archive"] для broadcasts). */
  deepLinkKeys: readonly string[];
};

/**
 * Реестр вкладок экрана «Коммуникации».
 * Добавить новую вкладку = создать компонент + строка здесь.
 */
export const COMMUNICATIONS_TAB_REGISTRY: CommunicationsTabRegistryEntry[] = [
  {
    id: "chats",
    loader: () => import("./tabs/ChatsTab").then((m) => ({ default: m.ChatsTab })),
    deepLinkKeys: [],
  },
  {
    id: "intake",
    loader: () => import("./tabs/IntakeTab").then((m) => ({ default: m.IntakeTab })),
    deepLinkKeys: ["id"],
  },
  {
    id: "comments",
    loader: () => import("./tabs/CommentsTab").then((m) => ({ default: m.CommentsTab })),
    deepLinkKeys: [],
  },
  {
    id: "broadcasts",
    loader: () => import("./tabs/BroadcastsTab").then((m) => ({ default: m.BroadcastsTab })),
    deepLinkKeys: ["archive"],
  },
];
