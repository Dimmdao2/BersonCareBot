/**
 * Главная пациента «Сегодня» (`/app/patient`): витрина из `patient_home_blocks` / `patient_home_block_items`.
 * Без сессии — только non-personal витрина (Phase 4.5); персональные блоки при tier patient.
 */

import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { AppShell } from "@/shared/ui/AppShell";
import { LegalFooterLinks } from "@/shared/ui/LegalFooterLinks";
import { Suspense } from "react";
import { PatientLoadingPatternBody } from "@/shared/ui/patientVisual";
import { PatientHomeToday } from "./home/PatientHomeToday";

export default async function PatientHomePage() {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <AppShell
        title="Сегодня"
        user={null}
        variant="patient-wide"
        patientSuppressShellTitle
        patientHideRightIcons
        patientHideHome
      >
        <Suspense fallback={<PatientLoadingPatternBody pattern="heroList" />}>
          <PatientHomeToday session={null} personalTierOk={false} canViewAuthOnlyContent={false} />
        </Suspense>
        <LegalFooterLinks className="mt-3 pb-2" />
      </AppShell>
    );
  }

  const personalTierOk = (await patientRscPersonalDataGate(session, routePaths.patient)) === "allow";
  const canViewAuthOnlyContent = await resolvePatientCanViewAuthOnlyContent(session);

  return (
    <AppShell title="Сегодня" user={session.user} variant="patient-wide" patientSuppressShellTitle>
      <Suspense fallback={<PatientLoadingPatternBody pattern="heroList" />}>
        <PatientHomeToday
          session={session}
          personalTierOk={personalTierOk}
          canViewAuthOnlyContent={canViewAuthOnlyContent}
        />
      </Suspense>
      <LegalFooterLinks className="mt-3 pb-2" />
    </AppShell>
  );
}
