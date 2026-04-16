import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addReferenceItem, saveReferenceItem, toggleReferenceItem } from "../actions";
import { ReferenceCacheBuster } from "./ReferenceCacheBuster";

type PageProps = {
  params: Promise<{ categoryCode: string }>;
  searchParams?: Promise<{ mode?: string }>;
};

export default async function DoctorReferenceCategoryPage({ params, searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const { categoryCode } = await params;
  const sp = (await searchParams) ?? {};
  const showActiveOnly = sp.mode === "active";
  const deps = buildAppDeps();
  const category = await deps.references.findCategoryByCode(categoryCode);
  if (!category) notFound();

  const allItems = await deps.references.listItemsForManagementByCategoryCode(category.code);
  const items = showActiveOnly ? allItems.filter((item) => item.isActive) : allItems;
  const categoryHref = `/app/doctor/references/${encodeURIComponent(category.code)}`;

  return (
    <AppShell title={category.title} user={session.user} variant="doctor" backHref="/app/doctor/references">
      <ReferenceCacheBuster categoryCode={category.code} />
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">Код: {category.code}</p>
          <Badge variant={category.isUserExtensible ? "secondary" : "outline"}>
            {category.isUserExtensible ? "Расширяемый" : "Системный"}
          </Badge>
          <Badge variant="secondary">{showActiveOnly ? "Показаны: только активные" : "Показаны: все"}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={categoryHref}
            className={`rounded-md px-3 py-1.5 text-sm ${
              !showActiveOnly ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
            }`}
          >
            Все
          </Link>
          <Link
            href={`${categoryHref}?mode=active`}
            className={`rounded-md px-3 py-1.5 text-sm ${
              showActiveOnly ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
            }`}
          >
            Только активные
          </Link>
        </div>

        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-border bg-card p-3">
              <div className="grid gap-3 md:grid-cols-[1fr_2fr_120px_auto_auto] md:items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground" htmlFor={`code-${item.id}`}>
                    Код
                  </label>
                  <Input id={`code-${item.id}`} value={item.code} readOnly />
                </div>

                <form action={saveReferenceItem} className="contents">
                  <input type="hidden" name="categoryCode" value={category.code} />
                  <input type="hidden" name="itemId" value={item.id} />

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground" htmlFor={`title-${item.id}`}>
                      Название
                    </label>
                    <Input id={`title-${item.id}`} name="title" defaultValue={item.title} required />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground" htmlFor={`sort-${item.id}`}>
                      Порядок
                    </label>
                    <Input id={`sort-${item.id}`} name="sortOrder" type="number" defaultValue={item.sortOrder} />
                  </div>

                  <Button type="submit" size="sm">
                    Сохранить
                  </Button>
                </form>

                <form action={toggleReferenceItem}>
                  <input type="hidden" name="categoryCode" value={category.code} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="nextActive" value={item.isActive ? "false" : "true"} />
                  <Button type="submit" size="sm" variant={item.isActive ? "outline" : "secondary"}>
                    {item.isActive ? "Архивировать" : "Восстановить"}
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium">Добавить значение</h2>
          <form action={addReferenceItem} className="grid gap-3 md:grid-cols-[1fr_2fr_120px_auto] md:items-end">
            <input type="hidden" name="categoryCode" value={category.code} />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="new-code">
                Код
              </label>
              <Input id="new-code" name="code" required placeholder="lower_snake_case" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="new-title">
                Название
              </label>
              <Input id="new-title" name="title" required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="new-sort">
                Порядок
              </label>
              <Input id="new-sort" name="sortOrder" type="number" defaultValue={999} />
            </div>
            <Button type="submit">Добавить</Button>
          </form>
        </section>

        <Link href="/app/doctor/references" className="text-sm text-primary underline underline-offset-4">
          К списку справочников
        </Link>
      </section>
    </AppShell>
  );
}
