import { notFound } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { doctorCatalogEditorSectionClass } from "@/shared/ui/doctorVisual";
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

  const [usage, exercises] = await Promise.all([
    deps.lfkTemplates.getTemplateUsage(template.id),
    deps.lfkExercises.listExercises({ includeArchived: false }),
  ]);
  const exerciseCatalog = exercises.map((e) => ({
    id: e.id,
    title: e.title,
    firstMedia: e.media[0] ?? null,
  }));

  return (
    <AppShell
      title="Конструктор комплекса"
      user={session.user}
      variant="doctor"
      backHref="/app/doctor/lfk-templates"
    >
      <section className={doctorCatalogEditorSectionClass}>
        <TemplateEditor
          template={template}
          exerciseCatalog={exerciseCatalog}
          externalUsageSnapshot={usage}
        />
      </section>
    </AppShell>
  );
}
