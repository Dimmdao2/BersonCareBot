import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { buttonVariants } from "@/components/ui/button-variants";
import { PageSection } from "@/components/common/layout/PageSection";
import { SectionHeading } from "@/components/common/typography/SectionHeading";
import { cn } from "@/lib/utils";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function DoctorContentSectionsPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  let sections: Awaited<ReturnType<typeof deps.contentSections.listAll>> = [];
  try {
    sections = await deps.contentSections.listAll();
  } catch {
    /* port unavailable */
  }

  return (
    <AppShell title="Разделы контента" user={session.user} variant="doctor" backHref="/app/doctor/content">
      <PageSection id="doctor-content-sections-section" as="section" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading level="subsection" className="m-0">
            Разделы
          </SectionHeading>
          <Link href="/app/doctor/content/sections/new" className={cn(buttonVariants({ size: "sm" }))}>
            Создать раздел
          </Link>
        </div>
        {sections.length === 0 ? (
          <p className="text-muted-foreground">Нет разделов. Создайте первый раздел или проверьте подключение к БД.</p>
        ) : (
          <table id="doctor-content-sections-table" className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-left">Заголовок</th>
                <th className="p-2 text-left">Slug</th>
                <th className="p-2 text-left">Порядок</th>
                <th className="p-2 text-left">Видимость</th>
                <th className="p-2 text-left">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => (
                <tr key={s.id}>
                  <td className="p-2">{s.title}</td>
                  <td className="p-2">
                    <code>{s.slug}</code>
                  </td>
                  <td className="p-2">{s.sortOrder}</td>
                  <td className="p-2">{s.isVisible ? "да" : "нет"}</td>
                  <td className="p-2">
                    <Link
                      href={`/app/doctor/content/sections/edit/${encodeURIComponent(s.slug)}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    >
                      Редактировать
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PageSection>
    </AppShell>
  );
}
