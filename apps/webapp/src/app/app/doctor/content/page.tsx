import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function DoctorContentPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  let pages: Awaited<ReturnType<typeof deps.contentPages.listAll>> = [];
  try {
    pages = await deps.contentPages.listAll();
  } catch {
    /* port unavailable */
  }

  return (
    <AppShell title="Контент" user={session.user} variant="doctor">
      <section id="doctor-content-section" className="panel stack">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Страницы контента</h2>
          <Link href="/app/doctor/content/new" className="button">
            Создать страницу
          </Link>
        </div>
        {pages.length === 0 ? (
          <p className="empty-state">Нет страниц контента.</p>
        ) : (
          <table id="doctor-content-table" className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>Раздел</th>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>Заголовок</th>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>Slug</th>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>Опубликовано</th>
                <th style={{ padding: "0.5rem" }}></th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id}>
                  <td style={{ padding: "0.5rem" }}>{p.section}</td>
                  <td style={{ padding: "0.5rem" }}>{p.title}</td>
                  <td style={{ padding: "0.5rem" }}>
                    <code>{p.slug}</code>
                  </td>
                  <td style={{ padding: "0.5rem" }}>{p.isPublished ? "да" : "нет"}</td>
                  <td style={{ padding: "0.5rem" }}>
                    <Link href={`/app/doctor/content/edit/${p.id}`} className="button button--ghost">
                      Редактировать
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AppShell>
  );
}
