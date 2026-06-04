"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { PatientPhonePromptChromeProvider } from "@/shared/ui/patient/PatientPhonePromptChromeContext";
import { MiniAppShareContactGate } from "@/shared/ui/patient/MiniAppShareContactGate";
import { PatientCalendarTimezoneBootstrap } from "./PatientCalendarTimezoneBootstrap";
import { PatientWebPushProvider } from "@/shared/lib/webPush/PatientWebPushContext";
import { PatientWebPushBootstrap } from "@/shared/ui/patient/webPush/PatientWebPushBootstrap";
import { PwaAppAccessGate } from "@/shared/ui/patient/pwa/PwaAppAccessGate";
import { PatientAnalyticsReporter } from "@/shared/ui/patient/PatientAnalyticsReporter";

const allowPatientBrowserAccess = process.env.NODE_ENV !== "production";

/** Клиентская обёртка пациентского раздела (гейт Mini App). Серверный редирект по телефону — в `layout.tsx`. */
export function PatientClientLayout({ children }: { children: ReactNode }) {
  return (
    <PatientPhonePromptChromeProvider>
      <MiniAppShareContactGate>
        <PatientWebPushProvider>
          <Suspense fallback={null}>
            <PwaAppAccessGate allowBrowserAccess={allowPatientBrowserAccess}>
              <PatientCalendarTimezoneBootstrap />
              <PatientWebPushBootstrap />
              <PatientAnalyticsReporter />
              {children}
            </PwaAppAccessGate>
          </Suspense>
        </PatientWebPushProvider>
      </MiniAppShareContactGate>
    </PatientPhonePromptChromeProvider>
  );
}
