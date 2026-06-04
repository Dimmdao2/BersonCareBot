/**
 * Главная пациента «Сегодня» (`/app/patient`): витрина из `patient_home_blocks` / `patient_home_block_items`.
 * Без сессии — редирект на `/app` в `patient/layout.tsx` (в т.ч. после установки PWA с `start_url` здесь).
 */

import { DateTime } from "luxon";
import { patientRscPersonalDataGate, requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { patientGreetingPersonalizedName } from "@/modules/patient-home/patientGreetingPersonalizedName";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import { LegalFooterLinks } from "@/shared/ui/patient/LegalFooterLinks";
import { Suspense } from "react";
import { PatientLoadingPatternBody } from "@/shared/ui/patient/patientVisual";
import {
  greetingPrefixFromHour,
  PatientHomeGreetingMobileHeader,
} from "./home/PatientHomeGreeting";
import { PatientHomeToday } from "./home/PatientHomeToday";

export const dynamic = "force-dynamic";

export default async function PatientHomePage() {
  const session = await requirePatientAccess(routePaths.patient);

  const personalTierOk = (await patientRscPersonalDataGate(session, routePaths.patient)) === "allow";
  const canViewAuthOnlyContent = await resolvePatientCanViewAuthOnlyContent(session);
  const appTz = await getAppDisplayTimeZone();
  const personalizedName =
    personalTierOk ? patientGreetingPersonalizedName(session.user) : null;
  const timeOfDayPrefix = greetingPrefixFromHour(DateTime.now().setZone(appTz).hour);

  return (
    <PatientAppShell
      title=""
      user={session.user}
     
      patientSuppressShellTitle
      patientMobileHeaderSlot={
        <PatientHomeGreetingMobileHeader
          personalizedName={personalizedName}
          timeOfDayPrefix={timeOfDayPrefix}
        />
      }
    >
      <Suspense fallback={<PatientLoadingPatternBody pattern="heroList" />}>
        <PatientHomeToday
          session={session}
          personalTierOk={personalTierOk}
          canViewAuthOnlyContent={canViewAuthOnlyContent}
        />
      </Suspense>
      <LegalFooterLinks className="mt-3 pb-2" />
    </PatientAppShell>
  );
}
