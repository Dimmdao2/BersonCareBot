"use client";

import { DoctorSupportInbox } from "../../messages/DoctorSupportInbox";
import type { CommunicationsTabProps } from "../communicationsTabRegistry";

/** Таб «Чаты» — оболочка вокруг DoctorSupportInbox. Block 4 добавит умный поллинг. */
export function ChatsTab(_: CommunicationsTabProps) {
  return <DoctorSupportInbox />;
}
