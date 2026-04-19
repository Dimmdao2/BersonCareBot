import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { TestSetsPageClient } from "./TestSetsPageClient";

type PageProps = {
  searchParams?: Promise<{ selected?: string }>;
};

export default async function DoctorTestSetsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const items = await deps.testSets.listTestSets({ includeArchived: false });

  const sp = (await searchParams) ?? {};
  const raw = typeof sp.selected === "string" ? sp.selected.trim() : "";
  const initialSelectedId = raw && items.some((s) => s.id === raw) ? raw : null;

  return (
    <AppShell title="Наборы тестов" user={session.user} variant="doctor" backHref="/app/doctor">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Набор ссылается на клинические тесты (таблицы <code className="text-xs">test_sets</code>,{" "}
          <code className="text-xs">test_set_items</code>).
        </p>
        <TestSetsPageClient initialSets={items} initialSelectedId={initialSelectedId} />
      </div>
    </AppShell>
  );
}
