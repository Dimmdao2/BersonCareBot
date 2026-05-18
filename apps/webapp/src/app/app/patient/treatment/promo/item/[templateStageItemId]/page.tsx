import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { patientMutedTextClass, patientInnerPageStackClass } from "@/shared/ui/patientVisual";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
import { mapTemplateStageItemToInstanceStageItemId } from "@/modules/treatment-program/mapTemplateStageItemToInstanceItem";
import { MarkdownContent } from "@/shared/ui/markdown/MarkdownContent";
import { PatientPromoVirtualItemActions } from "../PatientPromoVirtualItemActions";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ templateStageItemId: string }> };

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

  let tplItem: (typeof tpl.stages)[number]["items"][number] | null = null;
  for (const st of tpl.stages) {
    const it = st.items.find((i) => i.id === templateStageItemId);
    if (it) {
      tplItem = it;
      break;
    }
  }
  if (!tplItem) notFound();

  const list = await deps.treatmentProgramInstance.listForPatient(userId);
  const picked = pickActivePlanInstance(list);
  if (picked) {
    const detail = await deps.treatmentProgramInstance.getInstanceForPatient(userId, picked.id);
    if (detail) {
      const mapped = mapTemplateStageItemToInstanceStageItemId(tpl, detail, templateStageItemId);
      if (mapped) {
        redirect(routePaths.patientTreatmentProgramItem(picked.id, mapped, "exec", "program"));
      }
      redirect(routePaths.patientTreatmentProgram(picked.id));
    }
  }

  const commentMd = tplItem.comment?.trim() ?? "";
  const contentHref =
    tplItem.itemType === "lesson" && tplItem.itemRefId.trim() ?
      `/app/patient/content/${encodeURIComponent(tplItem.itemRefId.trim())}`
    : null;

  return (
    <AppShell
      title="Пункт программы"
      user={session.user}
      backHref={routePaths.patientTreatmentPromoDefault}
      backLabel="Программа"
      variant="patient"
    >
      <div className={cn(patientInnerPageStackClass, "max-w-xl")}>
        {commentMd ?
          <MarkdownContent
            text={commentMd}
            bodyFormat="markdown"
            className="markdown-preview text-[var(--patient-text-primary)] [&_p]:my-2 [&_p]:text-sm [&_p]:leading-relaxed"
          />
        : <p className={patientMutedTextClass}>Без описания</p>}
        {contentHref ?
          <p className="mt-4">
            <Link href={contentHref} prefetch={false} className="text-sm font-medium text-primary underline">
              Открыть материал
            </Link>
          </p>
        : null}
        <PatientPromoVirtualItemActions templateStageItemId={templateStageItemId} />
      </div>
    </AppShell>
  );
}
