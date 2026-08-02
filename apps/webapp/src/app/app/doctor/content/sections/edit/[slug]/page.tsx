import { notFound } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import {
  getMechanicMutationAvailability,
  requireEntitlementForReadAction,
} from '@/app-layer/guards/requireEntitlement';
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
  const entitlement = await requireEntitlementForReadAction(workspace, 'cms_pages');
  if (!entitlement.ok) notFound();
  if (!(await getMechanicMutationAvailability(workspace, 'cms_pages')).available) notFound();
  const session = workspace.session;
  const deps = buildAppDeps();
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);

  const [row, pagesInSection] = await withDoctorWorkspacePrincipal(
    workspace,
    'doctor.content.section.edit.read',
    () =>
      Promise.all([
        deps.contentSections.getBySlug(slug),
        deps.contentPages.countPagesWithSectionSlug(slug),
      ]),
  );
  if (!row) notFound();

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
