import { notFound } from "next/navigation";
import { requireDoctorWorkspaceContext } from "@/app-layer/guards/requireRole";
import { assertMechanicEnabled } from "@/app-layer/guards/requireEntitlement";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { doctorCatalogEditorSectionClass } from "@/shared/ui/doctor/doctorVisual";
import { TemplateEditor } from "../TemplateEditor";
import { LfkTemplatePreviewPanel } from "../LfkTemplatePreviewPanel";

type PageProps = { params: Promise<{ id: string }> };

export default async function DoctorLfkTemplateEditPage({ params }: PageProps) {
  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const { id } = await params;
  const deps = buildAppDeps();
  const includePlatformBase = await assertMechanicEnabled(workspace.organizationId, "exercise_catalog");
  const template = await deps.lfkTemplates.getTemplate(id, { includePlatformBase });
  if (!template) {
    notFound();
  }

  const [usage, exercises] = await Promise.all([
    template.ownerKind === "organization" ? deps.lfkTemplates.getTemplateUsage(template.id) : Promise.resolve(undefined),
    deps.lfkExercises.listExercises({ includeArchived: false, includePlatformBase }),
  ]);
  const exerciseCatalog = exercises.map((e) => ({
    id: e.id,
    title: e.title,
    firstMedia: e.media[0] ?? null,
  }));

  return (
    <DoctorAppShell
      title="Конструктор комплекса"
      user={session.user}
     
      backHref="/app/doctor/lfk-templates"
    >
      <section className={doctorCatalogEditorSectionClass}>
        {template.ownerKind === "platform" ? (
          <LfkTemplatePreviewPanel template={template} showOpenButton={false} />
        ) : (
          <TemplateEditor
            template={template}
            exerciseCatalog={exerciseCatalog}
            externalUsageSnapshot={usage}
          />
        )}
      </section>
    </DoctorAppShell>
  );
}
