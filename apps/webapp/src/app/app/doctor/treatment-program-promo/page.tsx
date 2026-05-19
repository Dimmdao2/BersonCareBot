import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
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
    <AppShell title="Промо-программа" user={session.user} variant="doctor" backHref="/app/doctor">
      <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
        <h1 className="mb-2 text-xl font-semibold">Промо-программа по умолчанию</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Шаблон для пациентов без назначенной программы. Экземпляр создаётся при первом действии или при создании
          напоминания «Программа реабилитации».
        </p>
        <DefaultPromoProgramClient
          initialTemplateId={currentId ?? ""}
          templates={templates.map((t) => ({ id: t.id, title: t.title.trim() || t.id }))}
          stats={{ activePromo, completedPromo }}
        />
      </div>
    </AppShell>
  );
}
