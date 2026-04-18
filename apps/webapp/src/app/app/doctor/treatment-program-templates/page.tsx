import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TREATMENT_PROGRAM_TEMPLATES_PATH } from "./paths";

export default async function TreatmentProgramTemplatesPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const items = await deps.treatmentProgram.listTemplates({ includeArchived: false });

  return (
    <AppShell title="Шаблоны программ" user={session.user} variant="doctor" backHref="/app/doctor">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Конструктор этапов шаблона лечебной программы (таблицы{" "}
            <code className="text-xs">treatment_program_templates</code> и связанные).
          </p>
          <Link href={`${TREATMENT_PROGRAM_TEMPLATES_PATH}/new`} className={cn(buttonVariants())}>
            Новый шаблон
          </Link>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted-foreground">Пока нет шаблонов.</li>
          ) : (
            items.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <Link
                  href={`${TREATMENT_PROGRAM_TEMPLATES_PATH}/${r.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {r.title}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">({r.status})</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </AppShell>
  );
}
