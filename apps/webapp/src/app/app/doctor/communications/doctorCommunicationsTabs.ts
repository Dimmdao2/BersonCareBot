/**
 * Канонические вкладки экрана «Коммуникации».
 *
 * Агрегатный URL `/app/doctor/communications?tab=<id>` через `doctorRouteRedirects`
 * делает internal-rewrite на легаси-страницу вкладки (chats→messages, intake→online-intake,
 * comments→comments, broadcasts→broadcasts). Браузерный URL остаётся `/communications?tab=<id>`,
 * поэтому активная вкладка определяется по query-параметру `tab`, а не по pathname.
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
  { id: "intake", label: "Заявки", href: `${COMMUNICATIONS_BASE}?tab=intake` },
  { id: "comments", label: "Комментарии", href: `${COMMUNICATIONS_BASE}?tab=comments` },
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

/**
 * Легаси-pathname → вкладка (для случая прямого рендера легаси-страницы, когда `?tab=` ещё не
 * проставлен — напр. SSR до применения rewrite-параметра). Совпадает с правилами `doctorRouteRedirects`.
 */
export function communicationsTabFromPathname(pathname: string): CommunicationsTabId | null {
  const norm = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  if (norm === "/app/doctor/messages") return "chats";
  if (norm === "/app/doctor/online-intake" || norm.startsWith("/app/doctor/online-intake/")) return "intake";
  if (norm === "/app/doctor/comments") return "comments";
  if (norm === "/app/doctor/broadcasts" || norm.startsWith("/app/doctor/broadcasts/")) return "broadcasts";
  return null;
}
