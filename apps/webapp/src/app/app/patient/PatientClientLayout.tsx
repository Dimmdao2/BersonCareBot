"use client";

import type { ReactNode } from "react";
import { PatientPhonePromptChromeProvider } from "@/shared/ui/patient/PatientPhonePromptChromeContext";
import { MiniAppShareContactGate } from "@/shared/ui/patient/MiniAppShareContactGate";

/** Клиентская обёртка пациентского раздела (гейт Mini App). Серверный редирект по телефону — в `layout.tsx`. */
export function PatientClientLayout({ children }: { children: ReactNode }) {
  return (
    <PatientPhonePromptChromeProvider>
      <MiniAppShareContactGate>{children}</MiniAppShareContactGate>
    </PatientPhonePromptChromeProvider>
  );
}
