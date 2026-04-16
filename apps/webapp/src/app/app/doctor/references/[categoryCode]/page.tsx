import Link from "next/link";
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { Badge } from "@/components/ui/badge";
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
  const categoryHref = `/app/doctor/references/${encodeURIComponent(category.code)}`;

  return (
    <>
      <ReferenceCacheBuster categoryCode={category.code} />
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">{category.title}</h1>
          <p className="text-sm text-muted-foreground">Код: {category.code}</p>
          <Badge variant={category.isUserExtensible ? "secondary" : "outline"}>
            {category.isUserExtensible ? "Расширяемый" : "Системный"}
          </Badge>
          <Badge variant="secondary">{mode === "archived" ? "Показаны: только архивные" : "Показаны: без архивных"}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={categoryHref}
            className={`rounded-md px-3 py-1.5 text-sm ${
              mode === "active" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
            }`}
          >
            Без архивных
          </Link>
          <Link
            href={`${categoryHref}?mode=archived`}
            className={`rounded-md px-3 py-1.5 text-sm ${
              mode === "archived" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
            }`}
          >
            Показать архив
          </Link>
        </div>

        <ReferenceItemsTableClient
          categoryCode={category.code}
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
