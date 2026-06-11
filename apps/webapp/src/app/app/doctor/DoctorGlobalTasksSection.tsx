"use client";

import { useCallback, useState, useTransition } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import type { SpecialistTaskRow } from "@/modules/specialist-tasks/types";
import { cn } from "@/lib/utils";
import { SpecialistTaskFormDialog } from "./clients/SpecialistTaskFormDialog";
import { SpecialistTaskRow as TaskRow } from "./clients/SpecialistTaskRow";

/** Сортировка: сначала задачи с дедлайном сегодня, затем по дате дедлайна, затем без срока. */
function sortTasksByDeadline(tasks: SpecialistTaskRow[], todayIso: string): SpecialistTaskRow[] {
  return [...tasks].sort((a, b) => {
    const aToday = a.dueAt != null && a.dueAt.startsWith(todayIso);
    const bToday = b.dueAt != null && b.dueAt.startsWith(todayIso);
    if (aToday !== bToday) return aToday ? -1 : 1;
    if (!a.dueAt && !b.dueAt) return 0;
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return a.dueAt.localeCompare(b.dueAt);
  });
}

export function DoctorGlobalTasksSection({
  initialTasks,
  todayIso,
  className,
}: {
  initialTasks: SpecialistTaskRow[];
  /** Дата сегодня в формате YYYY-MM-DD (из сервера) для сортировки по дедлайну. */
  todayIso: string;
  className?: string;
}) {
  const [tasks, setTasks] = useState(() => sortTasksByDeadline(initialTasks, todayIso));
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<SpecialistTaskRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = useCallback(() => {
    startTransition(async () => {
      setLoadError(null);
      const res = await fetch("/api/doctor/tasks");
      if (!res.ok) {
        setLoadError("Не удалось загрузить задачи");
        return;
      }
      const data = (await res.json()) as { tasks?: SpecialistTaskRow[] };
      setTasks(sortTasksByDeadline(data.tasks ?? [], todayIso));
    });
  }, [todayIso]);

  function handleComplete(taskId: string) {
    startTransition(async () => {
      await fetch(`/api/doctor/tasks/${encodeURIComponent(taskId)}/complete`, { method: "POST" });
      reload();
    });
  }

  return (
    <DoctorSection id="doctor-today-global-tasks" className={cn("h-full gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <DoctorSectionTitle>Задачи</DoctorSectionTitle>
        <Button type="button" size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          Новая
        </Button>
      </div>
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      {tasks.length === 0 && !loadError ? (
        <DoctorEmptyState>
          <p>Нет открытых задач</p>
        </DoctorEmptyState>
      ) : (
        <ul className="m-0 flex min-h-0 list-none flex-col gap-2 overflow-y-auto p-0">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              busy={isPending}
              onComplete={handleComplete}
              onEdit={(t) => {
                setEditing(t);
                setEditOpen(true);
              }}
            />
          ))}
        </ul>
      )}
      <SpecialistTaskFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        patientUserId=""
        editing={null}
        onSaved={reload}
      />
      {editing ? (
        <SpecialistTaskFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          patientUserId=""
          editing={editing}
          onSaved={() => {
            reload();
            setEditing(null);
          }}
        />
      ) : null}
    </DoctorSection>
  );
}
