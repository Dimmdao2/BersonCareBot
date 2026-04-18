import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { RECOMMENDATIONS_PATH } from "./paths";

export default async function DoctorRecommendationsPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const items = await deps.recommendations.listRecommendations({ includeArchived: false });

  return (
    <AppShell title="Рекомендации" user={session.user} variant="doctor" backHref="/app/doctor">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Текстовые рекомендации для этапов программы (таблица{" "}
            <code className="text-xs">recommendations</code>).
          </p>
          <Link href={`${RECOMMENDATIONS_PATH}/new`} className={cn(buttonVariants())}>
            Новая рекомендация
          </Link>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted-foreground">Пока нет записей.</li>
          ) : (
            items.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <Link
                  href={`${RECOMMENDATIONS_PATH}/${r.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {r.title}
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </AppShell>
  );
}
