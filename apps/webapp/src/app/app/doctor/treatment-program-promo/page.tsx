import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { DefaultPromoProgramClient } from "./DefaultPromoProgramClient";

export default async function DoctorTreatmentProgramPromoPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  const [templates, currentId, activePromo, completedPromo] = await Promise.all([
    deps.treatmentProgram.listTemplates({ status: "published" }),
    deps.systemSettings.getPatientDefaultPromoTreatmentProgramTemplateId(),
    deps.treatmentProgramInstance.countInstancesForAssignmentSource({
      assignmentSource: "promo",
      status: "active",
    }),
    deps.treatmentProgramInstance.countInstancesForAssignmentSource({
      assignmentSource: "promo",
      status: "completed",
    }),
  ]);

  return (
    <DoctorAppShell title="Промо-программа" user={session.user} backHref="/app/doctor">
      <DoctorPageHeader
        title="Промо-программа по умолчанию"
        subtitle="Шаблон для пациентов без назначенной программы. Экземпляр создаётся при первом действии или при создании напоминания «Программа реабилитации»."
      />
      <DefaultPromoProgramClient
        initialTemplateId={currentId ?? ""}
        templates={templates.map((t) => ({ id: t.id, title: t.title.trim() || t.id }))}
        stats={{ activePromo, completedPromo }}
      />
    </DoctorAppShell>
  );
}
