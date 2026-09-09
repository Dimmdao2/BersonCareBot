'use client';

import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { PatientPhonePromptChromeProvider } from '@/shared/ui/patient/PatientPhonePromptChromeContext';
import { MiniAppShareContactGate } from '@/shared/ui/patient/MiniAppShareContactGate';
import { PatientCalendarTimezoneBootstrap } from './PatientCalendarTimezoneBootstrap';
import { PatientWebPushProvider } from '@/shared/lib/webPush/PatientWebPushContext';
import { PatientWebPushBootstrap } from '@/shared/ui/patient/webPush/PatientWebPushBootstrap';
import { PatientAnalyticsReporter } from '@/shared/ui/patient/PatientAnalyticsReporter';
import type { PatientOrganizationSummary } from '@/modules/patient-organization/service';
import { PatientOrganizationContextProvider } from '@/shared/ui/patient/organization/PatientOrganizationContext';
import type { AuthChannelUiPolicy } from '@/modules/auth/otpChannelUi';
import { PatientRuntimeFeaturesProvider } from '@/shared/ui/patient/PatientRuntimeFeaturesContext';
import type { WorkspaceModuleEffective } from '@/modules/system-settings/doctorWorkspaceComposition';
import { ActiveCallCoordinator } from '@/shared/ui/video/ActiveCallCoordinator';
import { PatientActiveCallIndicator } from '@/shared/ui/patient/calls/PatientActiveCallIndicator';

/** Клиентская обёртка пациентского раздела (гейт Mini App). Серверный редирект по телефону — в `layout.tsx`. */
export function PatientClientLayout({
  children,
  organizationContext,
  workspaceModules,
  patientLabel,
  rememberOrganizationOnMount = false,
  authChannelPolicy,
  materialRatingsEnabled,
}: {
  children: ReactNode;
  organizationContext?: {
    organization: PatientOrganizationSummary;
    organizations: PatientOrganizationSummary[];
  } | null;
  workspaceModules?: WorkspaceModuleEffective;
  patientLabel?: unknown;
  rememberOrganizationOnMount?: boolean;
  authChannelPolicy: AuthChannelUiPolicy;
  materialRatingsEnabled: boolean;
}) {
  const content = organizationContext ? (
    <PatientOrganizationContextProvider
      organization={organizationContext.organization}
      organizations={organizationContext.organizations}
      workspaceModules={workspaceModules}
      patientLabel={patientLabel}
      rememberOrganizationOnMount={rememberOrganizationOnMount}
    >
      {children}
    </PatientOrganizationContextProvider>
  ) : (
    children
  );
  return (
    <ActiveCallCoordinator
      floatingIndicator={<PatientActiveCallIndicator />}
      activeRouteClassName="fixed inset-x-0 top-[var(--patient-header-bar-height,0px)] bottom-[var(--patient-bottom-nav-height,0px)] z-40 bg-black"
    >
      <PatientPhonePromptChromeProvider>
        <MiniAppShareContactGate channelPolicy={authChannelPolicy}>
          <PatientWebPushProvider>
            <PatientRuntimeFeaturesProvider materialRatingsEnabled={materialRatingsEnabled}>
              <Suspense fallback={null}>
                <PatientCalendarTimezoneBootstrap />
                <PatientWebPushBootstrap />
                <PatientAnalyticsReporter />
                {content}
              </Suspense>
            </PatientRuntimeFeaturesProvider>
          </PatientWebPushProvider>
        </MiniAppShareContactGate>
      </PatientPhonePromptChromeProvider>
    </ActiveCallCoordinator>
  );
}
