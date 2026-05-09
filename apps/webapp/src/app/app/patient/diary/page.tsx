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
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { DiarySectionGuestAccess } from "@/shared/ui/patient/guestAccess";
import { AppShell } from "@/shared/ui/AppShell";
import { PatientLoadingPatternBody } from "@/shared/ui/patientVisual";
import { PatientDiaryAuthenticatedMain } from "./PatientDiaryAuthenticatedMain";

export default async function PatientDiaryPage() {
  const session = await getOptionalPatientSession();
  const dataGate = await patientRscPersonalDataGate(session, routePaths.diary);
  if (dataGate === "guest") {
    return (
      <AppShell
        title="Дневник"
        user={session?.user ?? null}
        backHref="/app/patient"
        backLabel="Меню"
        variant="patient"
      >
        <DiarySectionGuestAccess session={session} returnTo={routePaths.diary} />
      </AppShell>
    );
  }
  const s = session!;

  return (
    <AppShell title="Дневник" user={s.user} backHref="/app/patient" backLabel="Меню" variant="patient">
      <Suspense fallback={<PatientLoadingPatternBody pattern="heroList" />}>
        <PatientDiaryAuthenticatedMain userId={s.user.userId} />
      </Suspense>
    </AppShell>
  );
}
