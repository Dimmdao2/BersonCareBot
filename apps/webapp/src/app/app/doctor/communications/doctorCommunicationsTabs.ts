/**
 * Канонические вкладки экрана «Коммуникации».
 *
 * `/app/doctor/communications` — настоящая страница-шелл (`page.tsx` → `DoctorCommunicationsShell`).
 * Internal-rewrite убран. Активная вкладка определяется по `?tab=` параметру.
 * Старые прямые URL (`/messages`, `/comments` и др.) → 308 на агрегатный URL
 * через `doctorRouteRedirects.ts`. Schedule-rewrite и его REWRITE_MARKER_HEADER не затронуты.
 */

import {
  COMMUNICATIONS_SURFACE_TABS,
  type CommunicationsSurfaceTabId,
} from '@/modules/doctor-communications/communicationsSurface';

export const COMMUNICATIONS_BASE = '/app/doctor/communications';

export type CommunicationsTabId = CommunicationsSurfaceTabId;

export type CommunicationsTab = {
  id: CommunicationsTabId;
  label: string;
  href: string;
  workspaceModule: (typeof COMMUNICATIONS_SURFACE_TABS)[number]['workspaceModule'];
};

export const COMMUNICATIONS_TABS: CommunicationsTab[] = COMMUNICATIONS_SURFACE_TABS.map((tab) => ({
  ...tab,
  href: `${COMMUNICATIONS_BASE}?tab=${tab.id}`,
}));

export const COMMUNICATIONS_DEFAULT_TAB: CommunicationsTabId = 'chats';

/**
 * Deep-link to a specific conversation on the Chats tab (#812: «Сегодня» KPI
 * «открыть переписку» must select the exact dialog, not just open the tab).
 * Consumed by ChatsTab/DoctorSupportInbox via `?tab=chats&chatId=`.
 * Ключ namespaced (`chatId`, не `id`): шелл копирует URL-ключ в КАЖДЫЙ таб,
 * который его объявляет, а `id` уже занят intake — общий ключ протекал бы
 * conversationId в intake как request-id (stray 404 fetch).
 */
export function communicationsChatHref(conversationId: string): string {
  return `${COMMUNICATIONS_BASE}?tab=chats&chatId=${encodeURIComponent(conversationId)}`;
}

/** Нормализует значение `?tab=` к валидному id вкладки (fallback — chats). */
export function communicationsTabFromQuery(
  tab: string | null | undefined,
  availableTabs: readonly CommunicationsTab[] = COMMUNICATIONS_TABS,
): CommunicationsTabId {
  return (
    availableTabs.find((candidate) => candidate.id === tab)?.id ??
    availableTabs[0]?.id ??
    COMMUNICATIONS_DEFAULT_TAB
  );
}
