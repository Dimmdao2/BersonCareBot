"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { cn } from "@/lib/utils";
import { getDoctorSectionItemClass } from "@/shared/ui/doctor/doctorVisual";
import { doctorInlineLinkClass } from "@/shared/ui/doctor/doctorVisual";
import type { SpecialistTaskRow as Task } from "@/modules/specialist-tasks/types";
import { isSpecialistTaskOverdue } from "@/modules/specialist-tasks/taskPriority";
import { patientCardHref } from "@/app/app/doctor/patients/patientCardHref";
import { DEFAULT_APP_DISPLAY_TIMEZONE } from "@/modules/system-settings/calendarIana";

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: DEFAULT_APP_DISPLAY_TIMEZONE,
  });
}

type Props = {
  task: Task;
  onComplete: (taskId: string) => void;
  onEdit: (task: Task) => void;
  busy?: boolean;
};

export function SpecialistTaskRow({ task, onComplete, onEdit, busy }: Props) {
  const overdue = isSpecialistTaskOverdue(task);
  const dueLabel = formatWhen(task.dueAt);

  return (
    <li
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        getDoctorSectionItemClass(overdue || task.isImportant ? "urgent" : "neutral"),
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">{task.title}</p>
          {task.isImportant ? (
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-destructive">
              <AlertTriangle className="size-3.5" aria-hidden />
              Важное
            </span>
          ) : null}
          {overdue ? <span className="text-xs font-medium text-destructive">Просрочено</span> : null}
          <span className="text-xs text-muted-foreground">Открыта</span>
        </div>
        {/* Patient link (S2.8): show when task is linked to a patient */}
        {task.patientUserId ? (
          <p className="mt-0.5 text-xs">
            <Link
              href={patientCardHref(task.patientUserId)}
              className={doctorInlineLinkClass}
              title="Открыть карточку пациента"
            >
              Пациент
            </Link>
          </p>
        ) : null}
        {formatWhen(task.createdAt) ? (
          <p className="text-xs text-muted-foreground">Поставлена: {formatWhen(task.createdAt)}</p>
        ) : null}
        {dueLabel ? <p className="text-xs text-muted-foreground">Срок: {dueLabel}</p> : null}
        {task.description?.trim() ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{task.description.trim()}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onEdit(task)}>
          Изменить
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={() => onComplete(task.id)}>
          Выполнить
        </Button>
      </div>
    </li>
  );
}
