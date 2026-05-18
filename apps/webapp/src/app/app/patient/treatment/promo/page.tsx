/**
 * Виртуальный просмотр промо-шаблона программы (без строки treatment_program_instances до первого действия).
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import {
  patientCardCompactClass,
  patientInnerPageStackClass,
  patientMutedTextClass,
} from "@/shared/ui/patientVisual";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
import { cn } from "@/lib/utils";

export default async function PatientTreatmentPromoDefaultPage() {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <AppShell title="Программа" user={null} backHref={routePaths.patient} backLabel="Меню" variant="patient">
        <p className={patientMutedTextClass}>Войдите, чтобы продолжить.</p>
      </AppShell>
    );
  }

  const dataGate = await patientRscPersonalDataGate(session, routePaths.patientTreatmentPromoDefault);
  if (dataGate === "guest") {
    return (
      <AppShell title="Программа" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
        <p className={patientMutedTextClass}>Раздел доступен после входа.</p>
      </AppShell>
    );
  }

  const deps = buildAppDeps();
  const userId = session.user.userId;
  const list = await deps.treatmentProgramInstance.listForPatient(userId);
  const picked = pickActivePlanInstance(list);
  if (picked) {
    redirect(routePaths.patientTreatmentProgram(picked.id));
  }

  const templateId = await deps.systemSettings.getPatientDefaultPromoTreatmentProgramTemplateId();
  if (!templateId) {
    redirect(routePaths.patientTreatmentPrograms);
  }

  let tpl;
  try {
    tpl = await deps.treatmentProgram.getTemplate(templateId);
  } catch {
    redirect(routePaths.patientTreatmentPrograms);
  }
  if (tpl.status !== "published") {
    redirect(routePaths.patientTreatmentPrograms);
  }

  const stagesSorted = [...tpl.stages].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );

  return (
    <AppShell
      title="Программа реабилитации"
      user={session.user}
      backHref={routePaths.patientTreatmentPrograms}
      backLabel="Программы"
      variant="patient"
    >
      <div className={patientInnerPageStackClass}>
        <p className={cn(patientMutedTextClass, "text-sm")}>{tpl.title}</p>
        <ul className="m-0 list-none space-y-4 p-0">
          {stagesSorted.map((st) => {
            const items = [...st.items].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
            if (items.length === 0) return null;
            return (
              <li key={st.id}>
                <p className="mb-2 text-sm font-medium text-foreground">{st.title}</p>
                <ul className="m-0 list-none space-y-2 p-0">
                  {items.map((it) => (
                    <li key={it.id}>
                      <Link
                        href={routePaths.patientTreatmentPromoTemplateItem(it.id)}
                        prefetch={false}
                        className={cn(
                          patientCardCompactClass,
                          "block cursor-pointer text-sm font-medium transition-colors hover:border-primary/30",
                        )}
                      >
                        {it.comment?.trim() || "Пункт программы"}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}
