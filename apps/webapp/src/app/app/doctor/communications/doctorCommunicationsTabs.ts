/**
 * Канонические вкладки экрана «Коммуникации».
 *
 * `/app/doctor/communications` — настоящая страница-шелл (`page.tsx` → `DoctorCommunicationsShell`).
 * Internal-rewrite убран (Block 5 TODO#3). Активная вкладка определяется по `?tab=` параметру.
 * Старые прямые URL (`/messages`, `/online-intake` и др.) → 308 на агрегатный URL
 * через `doctorRouteRedirects.ts`. Schedule-rewrite и его REWRITE_MARKER_HEADER не затронуты.
 */

export const COMMUNICATIONS_BASE = "/app/doctor/communications";

export type CommunicationsTabId = "chats" | "intake" | "comments" | "broadcasts";

export type CommunicationsTab = {
  id: CommunicationsTabId;
  label: string;
  href: string;
};

export const COMMUNICATIONS_TABS: CommunicationsTab[] = [
  { id: "chats", label: "Чаты", href: `${COMMUNICATIONS_BASE}?tab=chats` },
  { id: "comments", label: "Комментарии", href: `${COMMUNICATIONS_BASE}?tab=comments` },
  { id: "intake", label: "Заявки", href: `${COMMUNICATIONS_BASE}?tab=intake` },
  { id: "broadcasts", label: "Рассылки", href: `${COMMUNICATIONS_BASE}?tab=broadcasts` },
];

export const COMMUNICATIONS_DEFAULT_TAB: CommunicationsTabId = "chats";

/** Нормализует значение `?tab=` к валидному id вкладки (fallback — chats). */
export function communicationsTabFromQuery(tab: string | null | undefined): CommunicationsTabId {
  switch (tab) {
    case "intake":
      return "intake";
    case "comments":
      return "comments";
    case "broadcasts":
      return "broadcasts";
    case "chats":
      return "chats";
    default:
      return COMMUNICATIONS_DEFAULT_TAB;
  }
}

