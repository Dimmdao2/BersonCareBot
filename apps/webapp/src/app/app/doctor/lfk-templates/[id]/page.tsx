import { notFound } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { TemplateEditor } from "../TemplateEditor";

type PageProps = { params: Promise<{ id: string }> };

export default async function DoctorLfkTemplateEditPage({ params }: PageProps) {
  const session = await requireDoctorAccess();
  const { id } = await params;
  const deps = buildAppDeps();
  const template = await deps.lfkTemplates.getTemplate(id);
  if (!template) {
    notFound();
  }

  const exercises = await deps.lfkExercises.listExercises({ includeArchived: false });
  const exerciseCatalog = exercises.map((e) => ({ id: e.id, title: e.title }));

  return (
    <AppShell
      title="Конструктор шаблона ЛФК"
      user={session.user}
      variant="doctor"
      backHref="/app/doctor/lfk-templates"
    >
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <TemplateEditor template={template} exerciseCatalog={exerciseCatalog} />
      </section>
    </AppShell>
  );
}
