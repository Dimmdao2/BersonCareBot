"use client";

import { DoctorSupportInbox } from "../../messages/DoctorSupportInbox";
import type { CommunicationsTabProps } from "../communicationsTabRegistry";

/** Таб «Чаты» — поллинг только когда активный таб + видимое окно. */
export function ChatsTab({ isActive, displayIana }: CommunicationsTabProps) {
  return <DoctorSupportInbox active={isActive ?? true} displayIana={displayIana} />;
}
