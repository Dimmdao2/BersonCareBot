import { notFound } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logServerRuntimeError } from '@/infra/logging/serverRuntimeLog';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import {
  getMechanicMutationAvailability,
  requireEntitlementForReadAction,
} from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { cn } from '@/lib/utils';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { doctorSectionCardClass } from '@/shared/ui/doctor/doctorVisual';
import { DataLoadFailureNotice } from '@/shared/ui/doctor/DataLoadFailureNotice';
import { ContentForm } from '../../ContentForm';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function DoctorContentEditPage({ params }: Props) {
  const workspace = await requireDoctorWorkspaceContext();
  const entitlement = await requireEntitlementForReadAction(workspace, 'cms_pages');
  if (!entitlement.ok) notFound();
  if (!(await getMechanicMutationAvailability(workspace, 'cms_pages')).available) notFound();
  const session = workspace.session;
  const deps = buildAppDeps();
  const coursesEnabled = (await requireEntitlementForReadAction(workspace, 'courses')).ok;
  const { id } = await params;

  const page = await withDoctorWorkspacePrincipal(workspace, 'doctor.content.edit.read', () =>
    deps.contentPages.getById(id),
  );
  if (!page) notFound();

  let sections: Awaited<ReturnType<typeof deps.contentSections.listAll>> = [];
  let publishedCourses: { id: string; title: string }[] = [];
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;
  let materialRatingSummary: { avg: number | null; count: number } | null = null;
  try {
    ({ sections, publishedCourses } = await withDoctorWorkspacePrincipal(
      workspace,
      'doctor.content.edit.related-read',
      async () => ({
        sections: await deps.contentSections.listAll(),
        publishedCourses: coursesEnabled
          ? (
              await deps.courses.listCoursesForDoctor({
                status: 'published',
                includeArchived: false,
              })
            ).map((c) => ({ id: c.id, title: c.title }))
          : [],
      }),
    ));
  } catch (err) {
    loadError = logServerRuntimeError('app/doctor/content/edit', err, { pageId: id });
  }
  try {
    const agg = await withDoctorWorkspacePrincipal(
      workspace,
      'doctor.content.edit.rating-read',
      () =>
        deps.materialRating.getPublicAggregate({
          organizationId: workspace.organizationId,
          targetKind: 'content_page',
          targetId: page.id,
        }),
    );
    materialRatingSummary = { avg: agg.avg, count: agg.count };
  } catch {
    materialRatingSummary = null;
  }

  const isDev = process.env.NODE_ENV === 'development';

  return (
    <DoctorAppShell
      title="Редактировать страницу"
      user={session.user}
      backHref="/app/doctor/content"
    >
      <section className={cn(doctorSectionCardClass, 'gap-4')}>
        {loadError ? (
          <DataLoadFailureNotice
            digest={loadError.digest}
            devMessage={isDev ? `${loadError.name}: ${loadError.message}` : undefined}
          />
        ) : null}
        <ContentForm
          key={`${page.id}-${page.slug}`}
          page={page}
          sections={sections}
          publishedCourses={publishedCourses}
          materialRatingSummary={materialRatingSummary}
        />
      </section>
    </DoctorAppShell>
  );
}
