import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { buttonVariants } from "@/components/ui/button-variants";
import { PageSection } from "@/components/common/layout/PageSection";
import { SectionHeading } from "@/components/common/typography/SectionHeading";
import { cn } from "@/lib/utils";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { ContentLifecycleForms } from "./ContentLifecycleForms";

function groupBySection<T extends { section: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.section) ?? [];
    list.push(r);
    m.set(r.section, list);
  }
  return m;
}

function statusLabel(p: {
  isPublished: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
}): string {
  if (p.deletedAt) return "удалена";
  if (p.archivedAt) return "архив";
  return p.isPublished ? "опубликована" : "черновик";
}

export default async function DoctorContentPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  let pages: Awaited<ReturnType<typeof deps.contentPages.listAll>> = [];
  try {
    pages = await deps.contentPages.listAll();
  } catch {
    /* port unavailable */
  }

  const grouped = groupBySection(pages);

  return (
    <AppShell title="Контент" user={session.user} variant="doctor">
      <PageSection id="doctor-content-section" as="section" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Страницы контента</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/app/doctor/content/news" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Новости и мотивация
            </Link>
            <Link href="/app/doctor/content/new" className={cn(buttonVariants({ size: "sm" }))}>
              Создать страницу
            </Link>
          </div>
        </div>
        {pages.length === 0 ? (
          <p className="text-muted-foreground">Нет страниц контента.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {[...grouped.entries()].map(([section, rows]) => (
              <div key={section} className="flex flex-col gap-2">
                <SectionHeading level="subsection" className="m-0">
                  Раздел: {section}
                </SectionHeading>
                <table id={`doctor-content-table-${section}`} className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="p-2 text-left">Заголовок</th>
                      <th className="p-2 text-left">Slug</th>
                      <th className="p-2 text-left">Статус</th>
                      <th className="p-2 text-left">Действия</th>
                      <th className="p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td className="p-2">{p.title}</td>
                        <td className="p-2">
                          <code>{p.slug}</code>
                        </td>
                        <td className="p-2">{statusLabel(p)}</td>
                        <td className="p-2">
                          <ContentLifecycleForms page={p} />
                        </td>
                        <td className="p-2">
                          <Link
                            href={`/app/doctor/content/edit/${p.id}`}
                            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                          >
                            Редактировать
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </PageSection>
    </AppShell>
  );
}
