"use client";

import { DoctorSupportInbox } from "../../messages/DoctorSupportInbox";
import type { CommunicationsTabProps } from "../communicationsTabRegistry";

/**
 * Таб «Чаты» — поллинг только когда активный таб + видимое окно.
 * Deep-link ?chatId= ↔ URL-sync шелла (#812): выбранный диалог отражается в URL,
 * так что «открыть переписку» с других экранов может открыть конкретный чат.
 * (Ключ namespaced — `id` занят intake, общий ключ протекал бы между табами.)
 */
export function ChatsTab({ deepLinkParams, onDeepLinkChange, isActive, displayIana }: CommunicationsTabProps) {
  return (
    <DoctorSupportInbox
      active={isActive ?? true}
      displayIana={displayIana}
      initialSelectedConversationId={deepLinkParams.chatId ?? null}
      onSelectedConversationChange={(id) => onDeepLinkChange("chatId", id)}
    />
  );
}
