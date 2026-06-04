import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { cn } from "@/lib/utils";
import { AppShell } from "@/shared/ui/AppShell";
import { doctorSectionCardClass } from "@/shared/ui/doctorVisual";
import { DataLoadFailureNotice } from "@/shared/ui/DataLoadFailureNotice";
import { ContentForm } from "../../ContentForm";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function DoctorContentEditPage({ params }: Props) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const { id } = await params;

  const page = await deps.contentPages.getById(id);
  if (!page) notFound();

  let sections: Awaited<ReturnType<typeof deps.contentSections.listAll>> = [];
  let publishedCourses: { id: string; title: string }[] = [];
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;
  let materialRatingSummary: { avg: number | null; count: number } | null = null;
  try {
    sections = await deps.contentSections.listAll();
    publishedCourses = (
      await deps.courses.listCoursesForDoctor({ status: "published", includeArchived: false })
    ).map((c) => ({ id: c.id, title: c.title }));
  } catch (err) {
    loadError = logServerRuntimeError("app/doctor/content/edit", err, { pageId: id });
  }
  try {
    const agg = await deps.materialRating.getPublicAggregate({
      targetKind: "content_page",
      targetId: page.id,
    });
    materialRatingSummary = { avg: agg.avg, count: agg.count };
  } catch {
    materialRatingSummary = null;
  }

  const isDev = process.env.NODE_ENV === "development";

  return (
    <AppShell title="Редактировать страницу" user={session.user} variant="doctor" backHref="/app/doctor/content">
      <section className={cn(doctorSectionCardClass, "gap-4")}>
        {loadError ? (
          <DataLoadFailureNotice
            digest={loadError.digest}
            devMessage={isDev ? `${loadError.name}: ${loadError.message}` : undefined}
          />
        ) : null}
        <ContentForm key={`${page.id}-${page.slug}`} page={page} sections={sections} publishedCourses={publishedCourses} materialRatingSummary={materialRatingSummary} />
      </section>
    </AppShell>
  );
}
