import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { TestSetArchiveScope } from "@/modules/tests/types";
import { AppShell } from "@/shared/ui/AppShell";
import { TestSetsPageClient } from "./TestSetsPageClient";

type PageProps = {
  searchParams?: Promise<{ selected?: string; scope?: string }>;
};

export default async function DoctorTestSetsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  const sp = (await searchParams) ?? {};
  const scopeRaw = typeof sp.scope === "string" ? sp.scope.trim() : "";
  const archiveScope: TestSetArchiveScope =
    scopeRaw === "all" || scopeRaw === "archived" ? scopeRaw : "active";

  const items = await deps.testSets.listTestSets({ archiveScope });

  const raw = typeof sp.selected === "string" ? sp.selected.trim() : "";
  const initialSelectedId = raw && items.some((s) => s.id === raw) ? raw : null;

  return (
    <AppShell title="Наборы тестов" user={session.user} variant="doctor" backHref="/app/doctor">
      <TestSetsPageClient
        initialSets={items}
        initialSelectedId={initialSelectedId}
        initialArchiveScope={archiveScope}
      />
    </AppShell>
  );
}
