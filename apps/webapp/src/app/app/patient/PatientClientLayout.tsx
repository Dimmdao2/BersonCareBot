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
import type { PatientOrganizationSummary } from "@/modules/patient-organization/service";
import { PatientOrganizationContextProvider } from "@/shared/ui/patient/organization/PatientOrganizationContext";

const allowPatientBrowserAccess = process.env.NODE_ENV !== "production";

/** Клиентская обёртка пациентского раздела (гейт Mini App). Серверный редирект по телефону — в `layout.tsx`. */
export function PatientClientLayout({
  children,
  organizationContext,
}: {
  children: ReactNode;
  organizationContext?: {
    organization: PatientOrganizationSummary;
    organizations: PatientOrganizationSummary[];
  } | null;
}) {
  const content = organizationContext ?
    <PatientOrganizationContextProvider
      organization={organizationContext.organization}
      organizations={organizationContext.organizations}
    >
      {children}
    </PatientOrganizationContextProvider>
  : children;
  return (
    <PatientPhonePromptChromeProvider>
      <MiniAppShareContactGate>
        <PatientWebPushProvider>
          <Suspense fallback={null}>
            <PwaAppAccessGate allowBrowserAccess={allowPatientBrowserAccess}>
              <PatientCalendarTimezoneBootstrap />
              <PatientWebPushBootstrap />
              <PatientAnalyticsReporter />
              {content}
            </PwaAppAccessGate>
          </Suspense>
        </PatientWebPushProvider>
      </MiniAppShareContactGate>
    </PatientPhonePromptChromeProvider>
  );
}
