/**
 * Единая страница дневника: вкладки «Симптомы» и «ЛФК».
 */
import { Suspense } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { DiarySectionGuestAccess } from "@/shared/ui/patient/guestAccess";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/shared/ui/AppShell";
import { cn } from "@/lib/utils";
import { patientMutedTextClass, patientSectionSurfaceClass } from "@/shared/ui/patientVisual";
import { SymptomsTrackingSectionClient } from "./symptoms/SymptomsTrackingSectionClient";
import { DiaryTabsClient } from "./DiaryTabsClient";
import { LfkSessionForm } from "./lfk/LfkSessionForm";
import { reminderRuleToPatientJson } from "@/app/api/patient/reminders/reminderPatientJson";
import { createLfkComplex } from "./lfk/actions";
import { LfkDiarySectionClient } from "./lfk/LfkDiarySectionClient";
import { SymptomChart } from "@/modules/diaries/components/SymptomChart";
import { LfkStatsTable } from "@/modules/diaries/components/LfkStatsTable";

const EMPTY_STATS =
  "Скоро здесь будет ваша статистика. Для добавления записей в дневник воспользуйтесь кнопкой в меню бота.";

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
  const trackings = await deps.diaries.listSymptomTrackings(s.user.userId);
  const [complexes, reminderRules] = await Promise.all([
    deps.diaries.listLfkComplexes(s.user.userId),
    deps.reminders.listRulesByUser(s.user.userId),
  ]);

  const remindersByComplexId: Record<string, ReturnType<typeof reminderRuleToPatientJson>> = {};
  for (const r of reminderRules) {
    if (r.linkedObjectType !== "lfk_complex" || !r.linkedObjectId) continue;
    const prev = remindersByComplexId[r.linkedObjectId];
    const json = reminderRuleToPatientJson(r);
    if (!prev || json.updatedAt > prev.updatedAt) {
      remindersByComplexId[r.linkedObjectId] = json;
    }
  }

  const symptomsPanel = (
    <>
      <SymptomsTrackingSectionClient trackings={trackings} />
      <section id="patient-symptoms-stats-section" className={patientSectionSurfaceClass}>
        <h2 className="text-lg font-semibold">Статистика</h2>
        {trackings.length > 0 ? (
          <SymptomChart
            trackings={trackings.map((t) => ({ id: t.id, symptomTitle: t.symptomTitle ?? "—" }))}
          />
        ) : (
          <p className={patientMutedTextClass}>{EMPTY_STATS}</p>
        )}
      </section>
    </>
  );

  const lfkPanel = (
    <>
      <section id="patient-lfk-diary-hero-section" className={cn(patientSectionSurfaceClass, "!gap-4 !p-6")}>
        <h2 className="text-lg font-semibold">Отметить занятие</h2>
        <p className={patientMutedTextClass}>
          Комплексы ЛФК и история занятий. Добавить комплекс можно здесь или в боте.
        </p>
        {complexes.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className={patientMutedTextClass}>Создайте комплекс упражнений, чтобы начать отслеживать занятия.</p>
            <form action={createLfkComplex} className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  name="complexTitle"
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-[200px] flex-1"
                  placeholder="Название комплекса"
                  required
                />
                <Button type="submit">Создать</Button>
              </div>
            </form>
          </div>
        ) : (
          <LfkSessionForm complexes={complexes} />
        )}
      </section>
      {complexes.length > 0 ? (
        <LfkDiarySectionClient complexes={complexes} remindersByComplexId={remindersByComplexId} />
      ) : null}
      <section id="patient-lfk-stats-section" className={patientSectionSurfaceClass}>
        <h2 className="text-lg font-semibold">Статистика</h2>
        {complexes.length > 0 ? (
          <LfkStatsTable complexes={complexes.map((c) => ({ id: c.id, title: c.title ?? "—" }))} />
        ) : (
          <p className={patientMutedTextClass}>{EMPTY_STATS}</p>
        )}
      </section>
    </>
  );

  return (
    <AppShell
      title="Дневник"
      user={s.user}
      backHref="/app/patient"
      backLabel="Меню"
      variant="patient"
    >
      <Suspense fallback={<div className={cn(patientMutedTextClass, "p-4")}>Загрузка…</div>}>
        <DiaryTabsClient symptomsPanel={symptomsPanel} lfkPanel={lfkPanel} />
      </Suspense>
    </AppShell>
  );
}
