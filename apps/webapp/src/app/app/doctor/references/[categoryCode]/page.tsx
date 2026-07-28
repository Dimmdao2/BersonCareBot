import { notFound } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { ReferenceCacheBuster } from './ReferenceCacheBuster';
import { ReferenceItemsTableClient } from './ReferenceItemsTableClient';

type PageProps = {
  params: Promise<{ categoryCode: string }>;
};

export default async function DoctorReferenceCategoryPage({ params }: PageProps) {
  const { categoryCode } = await params;
  const workspace = await requireDoctorWorkspaceContext();
  const deps = buildAppDeps();
  const category = await withDoctorWorkspacePrincipal(workspace, () =>
    deps.references.findCategoryByCode(categoryCode),
  );
  if (!category) notFound();

  const allItems = await withDoctorWorkspacePrincipal(workspace, () =>
    deps.references.listItemsForManagementByCategoryCode(category.code),
  );

  return (
    <>
      <ReferenceCacheBuster categoryCode={category.code} />
      <section className="flex flex-col gap-3">
        <ReferenceItemsTableClient
          categoryTitle={category.title}
          categoryCode={category.code}
          initialItems={allItems.map((item) => ({
            id: item.id,
            code: item.code,
            title: item.title,
            sortOrder: item.sortOrder,
            isActive: item.isActive,
          }))}
        />
      </section>
    </>
  );
}
