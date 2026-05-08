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
import { DiarySectionGuestAccess } from "@/shared/ui/patient/guestAccess";
import { AppShell } from "@/shared/ui/AppShell";
import { cn } from "@/lib/utils";
import {
  patientMutedTextClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";
import { DiaryTabsClient } from "./DiaryTabsClient";
import { PatientWellbeingWeekChart } from "@/modules/diaries/components/PatientWellbeingWeekChart";
import { loadPatientDiaryWeekWellbeing } from "@/modules/diaries/loadPatientDiaryWeekWellbeing";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

const EMPTY_STATS =
  "За эту неделю пока нет отметок общего самочувствия. Отметки можно добавить на главной «Сегодня».";

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
  const deps = buildAppDeps();

  const wellbeing = await loadPatientDiaryWeekWellbeing(
    {
      diaries: deps.diaries,
      references: deps.references,
      patientCalendarTimezone: deps.patientCalendarTimezone,
      getAppDisplayTimeZone,
    },
    { userId: s.user.userId },
  );

  const wellbeingMvpSingle = (
    <section id="patient-diary-wellbeing-week-section" className={patientSectionSurfaceClass}>
      <h2 className={patientSectionTitleClass}>Самочувствие за неделю</h2>
      {!wellbeing.hasAnyInstant ?
        <p className={patientMutedTextClass}>{EMPTY_STATS}</p>
      : <PatientWellbeingWeekChart model={wellbeing.chart} iana={wellbeing.iana} />}
    </section>
  );

  return (
    <AppShell title="Дневник" user={s.user} backHref="/app/patient" backLabel="Меню" variant="patient">
      <Suspense fallback={<div className={cn(patientMutedTextClass, "p-4")}>Загрузка…</div>}>
        <DiaryTabsClient
          symptomsPanel={null}
          lfkPanel={null}
          wellbeingMvpSingle={wellbeingMvpSingle}
        />
      </Suspense>
    </AppShell>
  );
}
