"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SpecialistTaskRow as Task } from "@/modules/specialist-tasks/types";
import { isSpecialistTaskOverdue } from "@/modules/specialist-tasks/taskPriority";

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
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
        "flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
        overdue || task.isImportant ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/15",
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
