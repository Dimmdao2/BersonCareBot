import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import type { CourseStatus } from "@/modules/courses/types";
import { AppShell } from "@/shared/ui/AppShell";
import { DataLoadFailureNotice } from "@/shared/ui/DataLoadFailureNotice";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

function statusLabel(status: CourseStatus): string {
  switch (status) {
    case "draft":
      return "Черновик";
    case "published":
      return "Опубликован";
    case "archived":
      return "Архив";
    default:
      return status;
  }
}

function statusBadgeClass(status: CourseStatus): string {
  switch (status) {
    case "published":
      return "bg-emerald-600/15 text-emerald-900 dark:text-emerald-100";
    case "archived":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-amber-500/15 text-amber-950 dark:text-amber-100";
  }
}

export default async function DoctorCoursesPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  let courses: Awaited<ReturnType<typeof deps.courses.listCoursesForDoctor>> = [];
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;
  try {
    courses = await deps.courses.listCoursesForDoctor({ includeArchived: true });
  } catch (err) {
    loadError = logServerRuntimeError("app/doctor/courses", err);
  }

  const isDev = process.env.NODE_ENV === "development";

  return (
    <AppShell title="Курсы" user={session.user} variant="doctor" backHref="/app/doctor">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Все курсы (черновики, опубликованные и архивные). Создание — отдельная форма.
          </p>
          <Link href="/app/doctor/courses/new" className={buttonVariants({ size: "sm" })}>
            Новый курс
          </Link>
        </div>
        {loadError ? (
          <DataLoadFailureNotice
            digest={loadError.digest}
            devMessage={isDev ? `${loadError.name}: ${loadError.message}` : undefined}
          />
        ) : null}
        {courses.length === 0 && !loadError ? (
          <p className="text-sm text-muted-foreground">Пока нет ни одного курса.</p>
        ) : null}
        {courses.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {courses.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link
                    href={`/app/doctor/courses/${encodeURIComponent(c.id)}`}
                    className="truncate font-medium text-foreground underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {c.title}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">{c.id}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary" className={cn("font-normal", statusBadgeClass(c.status))}>
                    {statusLabel(c.status)}
                  </Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    обн. {new Date(c.updatedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </AppShell>
  );
}
