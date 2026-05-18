import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DOCTOR_PAGE_CONTAINER_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
import { AdminPromoProgramClient } from "./AdminPromoProgramClient";

export default async function AdminPromoProgramPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/app");
  if (session.user.role !== "admin") redirect("/app/settings");

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
    <div className={DOCTOR_PAGE_CONTAINER_CLASS}>
      <h1 className="mb-2 text-xl font-semibold">Промо-программа по умолчанию</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Шаблон для пациентов без назначенной программы. Экземпляр создаётся при первом действии или при создании
        напоминания «Программа реабилитации».
      </p>
      <AdminPromoProgramClient
        initialTemplateId={currentId ?? ""}
        templates={templates.map((t) => ({ id: t.id, title: t.title.trim() || t.id }))}
      />
      <div className="mt-10 border-t border-border pt-6">
        <h2 className="mb-2 text-base font-semibold">Статистика (promo)</h2>
        <ul className="m-0 list-none space-y-1 p-0 text-sm text-muted-foreground">
          <li>Активных экземпляров: {activePromo}</li>
          <li>Завершённых экземпляров: {completedPromo}</li>
        </ul>
      </div>
    </div>
  );
}
