/**
 * Главная пациента «Сегодня» (`/app/patient`): витрина из `patient_home_blocks` / `patient_home_block_items`.
 * Без сессии — редирект на `/app` в `patient/layout.tsx` (в т.ч. после установки PWA с `start_url` здесь).
 */

import { patientRscPersonalDataGate, requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { AppShell } from "@/shared/ui/AppShell";
import { LegalFooterLinks } from "@/shared/ui/LegalFooterLinks";
import { Suspense } from "react";
import { PatientLoadingPatternBody } from "@/shared/ui/patientVisual";
import { PatientHomeToday } from "./home/PatientHomeToday";

export const dynamic = "force-dynamic";

export default async function PatientHomePage() {
  const session = await requirePatientAccess(routePaths.patient);

  const personalTierOk = (await patientRscPersonalDataGate(session, routePaths.patient)) === "allow";
  const canViewAuthOnlyContent = await resolvePatientCanViewAuthOnlyContent(session);

  return (
    <AppShell title="" user={session.user} variant="patient-wide" patientSuppressShellTitle>
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
