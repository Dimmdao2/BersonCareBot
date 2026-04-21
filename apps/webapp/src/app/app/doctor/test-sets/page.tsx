import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ExerciseLoadType } from "@/modules/lfk-exercises/types";
import { AppShell } from "@/shared/ui/AppShell";
import { TestSetsPageClient } from "./TestSetsPageClient";

type PageProps = {
  searchParams?: Promise<{
    selected?: string;
    q?: string;
    region?: string;
    load?: string;
    titleSort?: string;
  }>;
};

export default async function DoctorTestSetsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const regionRefId = typeof sp.region === "string" && sp.region.trim() ? sp.region.trim() : undefined;
  const loadType =
    sp.load === "strength" ||
    sp.load === "stretch" ||
    sp.load === "balance" ||
    sp.load === "cardio" ||
    sp.load === "other"
      ? (sp.load as ExerciseLoadType)
      : undefined;

  const items = await deps.testSets.listTestSets({
    archiveScope: "active",
    search: q || null,
  });

  const raw = typeof sp.selected === "string" ? sp.selected.trim() : "";
  const initialSelectedId = raw && items.some((s) => s.id === raw) ? raw : null;

  return (
    <AppShell title="Наборы тестов" user={session.user} variant="doctor" backHref="/app/doctor">
      <TestSetsPageClient
        initialSets={items}
        initialSelectedId={initialSelectedId}
        filters={{ q, regionRefId, loadType }}
      />
    </AppShell>
  );
}
