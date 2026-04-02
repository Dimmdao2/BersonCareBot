/**
 * Единая страница дневника: вкладки «Симптомы» и «ЛФК».
 */
import { Suspense } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { DiarySectionGuestAccess, patientHasPhoneOrMessenger } from "@/shared/ui/patient/guestAccess";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/shared/ui/AppShell";
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
  if (!session || !patientHasPhoneOrMessenger(session)) {
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
  const deps = buildAppDeps();
  const trackings = await deps.diaries.listSymptomTrackings(session.user.userId);
  const [complexes, reminderRules] = await Promise.all([
    deps.diaries.listLfkComplexes(session.user.userId),
    deps.reminders.listRulesByUser(session.user.userId),
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
      <section id="patient-symptoms-stats-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Статистика</h2>
        {trackings.length > 0 ? (
          <SymptomChart
            trackings={trackings.map((t) => ({ id: t.id, symptomTitle: t.symptomTitle ?? "—" }))}
          />
        ) : (
          <p className="text-muted-foreground">{EMPTY_STATS}</p>
        )}
      </section>
    </>
  );

  const lfkPanel = (
    <>
      <section id="patient-lfk-diary-hero-section" className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Отметить занятие</h2>
        <p className="text-sm text-muted-foreground">
          Комплексы ЛФК и история занятий. Добавить комплекс можно здесь или в боте.
        </p>
        {complexes.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Создайте комплекс упражнений, чтобы начать отслеживать занятия.</p>
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
      <section id="patient-lfk-stats-section" className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Статистика</h2>
        {complexes.length > 0 ? (
          <LfkStatsTable complexes={complexes.map((c) => ({ id: c.id, title: c.title ?? "—" }))} />
        ) : (
          <p className="text-muted-foreground">{EMPTY_STATS}</p>
        )}
      </section>
    </>
  );

  return (
    <AppShell
      title="Дневник"
      user={session.user}
      backHref="/app/patient"
      backLabel="Меню"
      variant="patient"
    >
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Загрузка…</div>}>
        <DiaryTabsClient symptomsPanel={symptomsPanel} lfkPanel={lfkPanel} />
      </Suspense>
    </AppShell>
  );
}
