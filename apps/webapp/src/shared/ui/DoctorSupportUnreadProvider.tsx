"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useDoctorSupportUnreadCountPolling } from "@/modules/messaging/hooks/useSupportUnreadPolling";

const DoctorSupportUnreadContext = createContext<number | undefined>(undefined);

/** Один polling непрочитанных сообщений врача на всё дерево кабинета (меню, виджеты дашборда). */
export function DoctorSupportUnreadProvider({ children }: { children: ReactNode }) {
  const count = useDoctorSupportUnreadCountPolling();
  return (
    <DoctorSupportUnreadContext.Provider value={count}>{children}</DoctorSupportUnreadContext.Provider>
  );
}

export function useDoctorSupportUnreadCount(): number {
  const v = useContext(DoctorSupportUnreadContext);
  if (v === undefined) {
    throw new Error("useDoctorSupportUnreadCount must be used within DoctorSupportUnreadProvider");
  }
  return v;
}
