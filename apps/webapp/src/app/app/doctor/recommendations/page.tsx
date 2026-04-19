import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { RecommendationsPageClient } from "./RecommendationsPageClient";

type PageProps = {
  searchParams?: Promise<{ selected?: string }>;
};

export default async function DoctorRecommendationsPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const items = await deps.recommendations.listRecommendations({ includeArchived: false });

  const sp = (await searchParams) ?? {};
  const raw = typeof sp.selected === "string" ? sp.selected.trim() : "";
  const initialSelectedId = raw && items.some((r) => r.id === raw) ? raw : null;

  return (
    <AppShell title="Рекомендации" user={session.user} variant="doctor" backHref="/app/doctor">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Текстовые рекомендации для этапов программы (таблица <code className="text-xs">recommendations</code>).
        </p>
        <RecommendationsPageClient initialItems={items} initialSelectedId={initialSelectedId} />
      </div>
    </AppShell>
  );
}
