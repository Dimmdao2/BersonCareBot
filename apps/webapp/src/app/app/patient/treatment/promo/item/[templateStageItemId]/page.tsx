import { redirect, notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
import { mapTemplateStageItemToInstanceStageItemId } from "@/modules/treatment-program/mapTemplateStageItemToInstanceItem";
import { resolvePlanStartLessonPathForPatient } from "@/app/app/patient/go/resolvePatientReminderGoTargets";

type Props = { params: Promise<{ templateStageItemId: string }> };

/** Legacy deep-link на пункт промо-шаблона — редирект в материализованную программу. */
export default async function PatientTreatmentPromoItemPage({ params }: Props) {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <AppShell title="Пункт" user={null} backHref={routePaths.patient} backLabel="Меню" variant="patient">
        <p className={patientMutedTextClass}>Войдите, чтобы продолжить.</p>
      </AppShell>
    );
  }

  const dataGate = await patientRscPersonalDataGate(session, routePaths.patientTreatmentPromoDefault);
  if (dataGate === "guest") {
    return (
      <AppShell title="Пункт" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
        <p className={patientMutedTextClass}>Раздел доступен после входа.</p>
      </AppShell>
    );
  }

  const { templateStageItemId } = await params;
  const deps = buildAppDeps();
  const userId = session.user.userId;

  const templateId = await deps.systemSettings.getPatientDefaultPromoTreatmentProgramTemplateId();
  if (!templateId) notFound();

  let tpl;
  try {
    tpl = await deps.treatmentProgram.getTemplate(templateId);
  } catch {
    notFound();
  }
  if (tpl.status !== "published") notFound();

  const tplItem = tpl.stages.flatMap((st) => st.items).find((i) => i.id === templateStageItemId);
  if (!tplItem) notFound();

  await resolvePlanStartLessonPathForPatient(deps, userId);

  const list = await deps.treatmentProgramInstance.listForPatient(userId);
  const picked = pickActivePlanInstance(list);
  if (!picked) {
    redirect(routePaths.patientTreatmentPrograms);
  }

  const detail = await deps.treatmentProgramInstance.getInstanceForPatient(userId, picked.id);
  if (detail) {
    const mapped = mapTemplateStageItemToInstanceStageItemId(tpl, detail, templateStageItemId);
    if (mapped) {
      redirect(routePaths.patientTreatmentProgramItem(picked.id, mapped, "exec", "program"));
    }
  }

  redirect(routePaths.patientTreatmentProgram(picked.id));
}
