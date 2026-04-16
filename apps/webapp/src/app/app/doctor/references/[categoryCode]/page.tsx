import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { ReferenceCacheBuster } from "./ReferenceCacheBuster";
import { ReferenceItemsTableClient } from "./ReferenceItemsTableClient";

type PageProps = {
  params: Promise<{ categoryCode: string }>;
  searchParams?: Promise<{ mode?: string }>;
};

export default async function DoctorReferenceCategoryPage({ params, searchParams }: PageProps) {
  const { categoryCode } = await params;
  const sp = (await searchParams) ?? {};
  const mode = sp.mode === "archived" ? "archived" : "active";
  const deps = buildAppDeps();
  const category = await deps.references.findCategoryByCode(categoryCode);
  if (!category) notFound();

  const allItems = await deps.references.listItemsForManagementByCategoryCode(category.code);
  const items = mode === "archived" ? allItems.filter((item) => !item.isActive) : allItems.filter((item) => item.isActive);

  return (
    <>
      <ReferenceCacheBuster categoryCode={category.code} />
      <section className="flex flex-col gap-3">
        <ReferenceItemsTableClient
          categoryTitle={category.title}
          categoryCode={category.code}
          categoryIsUserExtensible={category.isUserExtensible}
          mode={mode}
          initialItems={items.map((item) => ({
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
