"use client";

import { DoctorSupportInbox } from "../../messages/DoctorSupportInbox";
import type { CommunicationsTabProps } from "../communicationsTabRegistry";

/**
 * Таб «Чаты» — поллинг только когда активный таб + видимое окно.
 * Deep-link ?id= ↔ URL-sync шелла (#812): выбранный диалог отражается в URL,
 * так что «открыть переписку» с других экранов может открыть конкретный чат.
 */
export function ChatsTab({ deepLinkParams, onDeepLinkChange, isActive, displayIana }: CommunicationsTabProps) {
  return (
    <DoctorSupportInbox
      active={isActive ?? true}
      displayIana={displayIana}
      initialSelectedConversationId={deepLinkParams.id ?? null}
      onSelectedConversationChange={(id) => onDeepLinkChange("id", id)}
    />
  );
}
