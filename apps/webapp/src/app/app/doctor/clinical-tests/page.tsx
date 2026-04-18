import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { CLINICAL_TESTS_PATH } from "./paths";

export default async function DoctorClinicalTestsPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const items = await deps.clinicalTests.listClinicalTests({ includeArchived: false });

  return (
    <AppShell title="Клинические тесты" user={session.user} variant="doctor" backHref="/app/doctor">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Библиотека тестов для программ лечения (таблица <code className="text-xs">tests</code>).
          </p>
          <Link href={`${CLINICAL_TESTS_PATH}/new`} className={cn(buttonVariants())}>
            Новый тест
          </Link>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted-foreground">Пока нет тестов.</li>
          ) : (
            items.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <Link
                    href={`${CLINICAL_TESTS_PATH}/${t.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {t.title}
                  </Link>
                  {t.testType ? (
                    <span className="ml-2 text-xs text-muted-foreground">({t.testType})</span>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </AppShell>
  );
}
