import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { buttonVariants } from "@/components/ui/button";
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
      <section id="doctor-content-section" className="panel stack">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <h2>Страницы контента</h2>
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
          <p className="empty-state">Нет страниц контента.</p>
        ) : (
          <div className="stack" style={{ gap: "1.5rem" }}>
            {[...grouped.entries()].map(([section, rows]) => (
              <div key={section} className="stack" style={{ gap: "0.5rem" }}>
                <h3 className="eyebrow" style={{ fontSize: "1rem", margin: 0 }}>
                  Раздел: {section}
                </h3>
                <table id={`doctor-content-table-${section}`} className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>Заголовок</th>
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>Slug</th>
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>Статус</th>
                      <th style={{ textAlign: "left", padding: "0.5rem" }}>Действия</th>
                      <th style={{ padding: "0.5rem" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td style={{ padding: "0.5rem" }}>{p.title}</td>
                        <td style={{ padding: "0.5rem" }}>
                          <code>{p.slug}</code>
                        </td>
                        <td style={{ padding: "0.5rem" }}>{statusLabel(p)}</td>
                        <td style={{ padding: "0.5rem" }}>
                          <ContentLifecycleForms page={p} />
                        </td>
                        <td style={{ padding: "0.5rem" }}>
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
      </section>
    </AppShell>
  );
}
