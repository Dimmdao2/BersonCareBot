/**
 * Дневник пациента (MVP): недельный график самочувствия (ComposedChart).
 *
 * TODO(diary-mvp-restore): вернуть вкладки «Симптомы» / «ЛФК», QuickAddPopup и загрузку связанных данных:
 * - `./symptoms/SymptomsTrackingSectionClient`, `@/modules/diaries/components/SymptomChart`
 * - `./lfk/LfkSessionForm`, `./lfk/LfkDiarySectionClient`, `@/modules/diaries/components/LfkStatsTable`
 * - `./QuickAddPopup`
 * Подробности — `diary/diary.md`.
 */
import { Suspense } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { PATIENT_DIARY_UI_LABEL } from "@/app-layer/routes/navigation";
import { PatientPlanTodayRemindersCard } from "@/app/app/patient/treatment/program-detail/PatientPlanTodayRemindersCard";
import { DiarySectionGuestAccess } from "@/shared/ui/patient/guestAccess";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import { PatientLoadingPatternBody } from "@/shared/ui/patient/patientVisual";
import { buildDiaryPlanReminderStrip } from "@/modules/patient-diary/buildDiaryPlanReminderStrip";
import { resolvePatientCanViewAuthOnlyContent } from "@/app-layer/platform-access";
import { PatientDiaryAuthenticatedMain } from "./PatientDiaryAuthenticatedMain";

type PageProps = {
  searchParams?: Promise<{ week?: string | string[] }>;
};

export default async function PatientDiaryPage({ searchParams }: PageProps) {
  const session = await getOptionalPatientSession();
  const dataGate = await patientRscPersonalDataGate(session, routePaths.diary);
  if (dataGate === "guest") {
    return (
      <PatientAppShell
        title={PATIENT_DIARY_UI_LABEL}
        user={session?.user ?? null}
        backHref="/app/patient"
        backLabel="Меню"
       
      >
        <DiarySectionGuestAccess session={session} returnTo={routePaths.diary} />
      </PatientAppShell>
    );
  }
  const s = session!;
  const sp = searchParams != null ? await searchParams : {};
  const weekRaw = sp.week;
  const week = Array.isArray(weekRaw) ? weekRaw[0] : weekRaw;
  const canViewAuthOnlyContent = await resolvePatientCanViewAuthOnlyContent(s);
  const deps = buildAppDeps();
  const planReminderStrip = await buildDiaryPlanReminderStrip(deps, s.user.userId, canViewAuthOnlyContent);

  return (
    <PatientAppShell
      title={PATIENT_DIARY_UI_LABEL}
      user={s.user}
      backHref="/app/patient"
      backLabel="Меню"
     
      patientShellAboveTitleSlot={
        <PatientPlanTodayRemindersCard {...planReminderStrip} />
      }
    >
      <Suspense fallback={<PatientLoadingPatternBody pattern="heroList" />}>
        <PatientDiaryAuthenticatedMain userId={s.user.userId} week={week} />
      </Suspense>
    </PatientAppShell>
  );
}
