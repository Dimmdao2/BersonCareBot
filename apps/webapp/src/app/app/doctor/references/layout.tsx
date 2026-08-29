import type { ReactNode } from 'react';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { CatalogRightPane } from '@/shared/ui/doctor/catalog/CatalogRightPane';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { ReferencesSidebar } from './ReferencesSidebar';

export default async function DoctorReferencesLayout({ children }: { children: ReactNode }) {
  const workspace = await requireDoctorWorkspaceContext();
  const deps = buildAppDeps();
  const categories = await withDoctorWorkspacePrincipal(workspace, () =>
    deps.references.listCategories(),
  );

  return (
    <DoctorAppShell
      title="Справочники"
      user={workspace.session.user}
      backHref="/app/doctor"
      layout="full-height"
    >
      <DoctorPageHeader title="Справочники" />
      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto md:grid-cols-[minmax(16rem,0.7fr)_minmax(0,2fr)] md:overflow-hidden">
        <ReferencesSidebar
          categories={categories}
          systemLinks={[{ href: '/app/doctor/references/measure-kinds', label: 'Виды измерений' }]}
        />
        <CatalogRightPane
          className="min-h-fit shrink-0 md:h-full md:min-h-0 md:shrink"
          contentClassName="overflow-visible md:overflow-y-auto"
        >
          {children}
        </CatalogRightPane>
      </div>
    </DoctorAppShell>
  );
}
