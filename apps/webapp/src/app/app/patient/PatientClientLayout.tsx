"use client";

import type { ReactNode } from "react";
import { PatientPhonePromptChromeProvider } from "@/shared/ui/patient/PatientPhonePromptChromeContext";
import { MiniAppShareContactGate } from "@/shared/ui/patient/MiniAppShareContactGate";
import { PatientCalendarTimezoneBootstrap } from "./PatientCalendarTimezoneBootstrap";
import { PatientWebPushBootstrap } from "@/shared/ui/patient/webPush/PatientWebPushBootstrap";

/** Клиентская обёртка пациентского раздела (гейт Mini App). Серверный редирект по телефону — в `layout.tsx`. */
export function PatientClientLayout({ children }: { children: ReactNode }) {
  return (
    <PatientPhonePromptChromeProvider>
      <MiniAppShareContactGate>
        <PatientCalendarTimezoneBootstrap />
        <PatientWebPushBootstrap />
        {children}
      </MiniAppShareContactGate>
    </PatientPhonePromptChromeProvider>
  );
}
