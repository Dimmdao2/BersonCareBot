import type { ReactNode } from "react";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { ReferencesSidebar } from "./ReferencesSidebar";

export default async function DoctorReferencesLayout({ children }: { children: ReactNode }) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const categories = await deps.references.listCategories();

  return (
    <AppShell title="Справочники" user={session.user} variant="doctor" backHref="/app/doctor">
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ReferencesSidebar categories={categories} />
        <section className="min-w-0 rounded-xl border border-border bg-card p-4">{children}</section>
      </div>
    </AppShell>
  );
}
