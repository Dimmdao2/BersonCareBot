import type { ReactNode } from "react";
import { requireDoctorWorkspaceContext } from "@/app-layer/guards/requireRole";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { ReferencesSidebar } from "./ReferencesSidebar";

export default async function DoctorReferencesLayout({ children }: { children: ReactNode }) {
  const workspace = await requireDoctorWorkspaceContext();
  const deps = buildAppDeps();
  const categories = await withDoctorWorkspacePrincipal(workspace, () => deps.references.listCategories());

  return (
    <DoctorAppShell title="Справочники" user={workspace.session.user} backHref="/app/doctor">
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ReferencesSidebar
          categories={categories}
          systemLinks={[{ href: "/app/doctor/references/measure-kinds", label: "Виды измерений" }]}
        />
        <section className="min-w-0 rounded-xl border border-border bg-card p-4">{children}</section>
      </div>
    </DoctorAppShell>
  );
}
