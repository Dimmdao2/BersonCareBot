import { notFound } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import {
  getMechanicMutationAvailability,
  getMechanicSurfaceVisibility,
  requireEntitlementForReadAction,
} from '@/app-layer/guards/requireEntitlement';
import { contentMechanicForSection } from '@/app-layer/content/warmupsContentMutationGuard';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { cn } from '@/lib/utils';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { doctorSectionCardClass } from '@/shared/ui/doctor/doctorVisual';
import { SectionForm } from '../../SectionForm';

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function DoctorContentSectionEditPage({ params }: Props) {
  const workspace = await requireDoctorWorkspaceContext();
  const [cmsVisibility, warmupsVisibility, cmsMutation, warmupsMutation] = await Promise.all([
    getMechanicSurfaceVisibility(workspace, 'cms_pages'),
    getMechanicSurfaceVisibility(workspace, 'warmups'),
    getMechanicMutationAvailability(workspace, 'cms_pages'),
    getMechanicMutationAvailability(workspace, 'warmups'),
  ]);
  if (!cmsVisibility.directUrl && !warmupsVisibility.directUrl) notFound();
  if (!cmsMutation.available && !warmupsMutation.available) notFound();
  const session = workspace.session;
  const deps = buildAppDeps();
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);

  const row = await withDoctorWorkspacePrincipal(
    workspace,
    'doctor.content.section.edit.read',
    () => deps.contentSections.getBySlug(slug),
  );
  if (!row) notFound();
  const mechanic = contentMechanicForSection(row);
  const entitlement = await requireEntitlementForReadAction(workspace, mechanic);
  if (!entitlement.ok) notFound();
  const mechanicMutation = mechanic === 'warmups' ? warmupsMutation : cmsMutation;
  if (!mechanicMutation.available) notFound();
  const pagesInSection = await withDoctorWorkspacePrincipal(
    workspace,
    'doctor.content.section.edit.page-count',
    () => deps.contentPages.countPagesWithSectionSlug(slug),
  );

  return (
    <DoctorAppShell
      title="Редактировать раздел"
      user={session.user}
      backHref="/app/doctor/content/sections"
    >
      <section className={cn(doctorSectionCardClass, 'gap-4')}>
        <SectionForm
          section={{
            slug: row.slug,
            title: row.title,
            description: row.description,
            sortOrder: row.sortOrder,
            isVisible: row.isVisible,
            requiresAuth: row.requiresAuth,
            coverImageUrl: row.coverImageUrl,
            iconImageUrl: row.iconImageUrl,
            kind: row.kind,
            systemParentCode: row.systemParentCode,
          }}
          pagesInSection={pagesInSection}
        />
      </section>
    </DoctorAppShell>
  );
}
