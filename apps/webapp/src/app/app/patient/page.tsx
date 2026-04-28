/**
 * Главная пациента «Сегодня» (`/app/patient`): витрина из `patient_home_blocks` / `patient_home_block_items`.
 * Layout требует сессию; персональные блоки — только при tier patient (`patientRscPersonalDataGate === allow`).
 */

import { redirect } from "next/navigation";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { AppShell } from "@/shared/ui/AppShell";
import { LegalFooterLinks } from "@/shared/ui/LegalFooterLinks";
import { PatientHomeToday } from "./home/PatientHomeToday";

export default async function PatientHomePage() {
  const session = await getOptionalPatientSession();
  if (!session) {
    redirect(`${routePaths.root}?next=${encodeURIComponent(routePaths.patient)}`);
  }

  const personalTierOk = (await patientRscPersonalDataGate(session, routePaths.patient)) === "allow";
  const canViewAuthOnlyContent = await resolvePatientCanViewAuthOnlyContent(session);

  return (
    <AppShell title="Сегодня" user={session.user} variant="patient">
      <PatientHomeToday
        session={session}
        personalTierOk={personalTierOk}
        canViewAuthOnlyContent={canViewAuthOnlyContent}
      />
      <LegalFooterLinks className="mt-4 pb-2" />
    </AppShell>
  );
}
