import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { TEST_SETS_PATH } from "./paths";

export default async function DoctorTestSetsPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const items = await deps.testSets.listTestSets({ includeArchived: false });

  return (
    <AppShell title="Наборы тестов" user={session.user} variant="doctor" backHref="/app/doctor">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Набор ссылается на клинические тесты (таблицы <code className="text-xs">test_sets</code>,{" "}
            <code className="text-xs">test_set_items</code>).
          </p>
          <Link href={`${TEST_SETS_PATH}/new`} className={cn(buttonVariants())}>
            Новый набор
          </Link>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted-foreground">Пока нет наборов.</li>
          ) : (
            items.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <Link
                  href={`${TEST_SETS_PATH}/${s.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {s.title}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">({s.items.length} тестов)</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </AppShell>
  );
}
