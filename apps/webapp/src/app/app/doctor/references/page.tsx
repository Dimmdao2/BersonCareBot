import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function DoctorReferencesPage() {
  const session = await requireDoctorAccess();
  return (
    <AppShell title="Справочники" user={session.user} variant="doctor">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col gap-4">
        <h2 className="text-base font-semibold">Справочники и данные</h2>
        <p className="text-sm text-muted-foreground">
          Справочники областей тела и других полей используются в упражнениях и CMS. Управление отдельным экраном «Справочники» планируется; сейчас данные доступны через связанные разделы.
        </p>
        <ul className="m-0 list-disc space-y-2 pl-5 text-sm">
          <li>
            <Link href="/app/doctor/exercises" className="text-primary underline">
              Упражнения и фильтры по области тела
            </Link>
          </li>
          <li>
            <Link href="/app/doctor/content" className="text-primary underline">
              CMS и контент
            </Link>
          </li>
        </ul>
      </section>
    </AppShell>
  );
}
