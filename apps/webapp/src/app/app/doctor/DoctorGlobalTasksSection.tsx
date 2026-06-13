"use client";

import { useCallback, useState, useTransition } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { doctorSectionSubtitleClass } from "@/shared/ui/doctor/doctorVisual";
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

/** Задачи с дедлайном сегодня. */
function filterTodayTasks(tasks: SpecialistTaskRow[], todayIso: string): SpecialistTaskRow[] {
  return tasks.filter((t) => t.dueAt != null && t.dueAt.startsWith(todayIso));
}

export function DoctorGlobalTasksSection({
  initialTasks,
  initialTasksTotal,
  todayIso,
  className,
}: {
  initialTasks: SpecialistTaskRow[];
  /**
   * Общее количество открытых задач (§1.3).
   * Если не передано — считается по initialTasks.length.
   */
  initialTasksTotal?: number;
  /** Дата сегодня в формате YYYY-MM-DD (из сервера) для сортировки по дедлайну. */
  todayIso: string;
  className?: string;
}) {
  const [tasks, setTasks] = useState(() => sortTasksByDeadline(initialTasks, todayIso));
  const [tasksTotal, setTasksTotal] = useState(initialTasksTotal ?? initialTasks.length);
  const [showAll, setShowAll] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<SpecialistTaskRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = useCallback(() => {
    startTransition(async () => {
      setLoadError(null);
      // limit=100 достаточно для практических нужд; SSR грузит без лимита (§1.3)
      const res = await fetch("/api/doctor/tasks?limit=100");
      if (!res.ok) {
        setLoadError("Не удалось загрузить задачи");
        return;
      }
      const data = (await res.json()) as { tasks?: SpecialistTaskRow[] };
      const sorted = sortTasksByDeadline(data.tasks ?? [], todayIso);
      setTasks(sorted);
      setTasksTotal(sorted.length);
    });
  }, [todayIso]);

  function handleComplete(taskId: string) {
    startTransition(async () => {
      await fetch(`/api/doctor/tasks/${encodeURIComponent(taskId)}/complete`, { method: "POST" });
      reload();
    });
  }

  // §1.3: задачи на сегодня (фильтр) и все остальные
  const todayTasks = filterTodayTasks(tasks, todayIso);
  const todayCount = todayTasks.length;
  const totalCount = tasksTotal;

  // По умолчанию — показываем задачи на сегодня.
  // «Все задачи» раскрывает остальные (задачи не на сегодня).
  const visibleTasks = showAll ? tasks : todayTasks;

  // hasMore = есть задачи вне сегодняшних (не зависит от того, показаны ли сегодняшние)
  const hasMore = !showAll && totalCount > todayCount;

  return (
    <DoctorSection id="doctor-today-global-tasks" className={cn("h-full gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <DoctorSectionTitle>Задачи</DoctorSectionTitle>
        <div className="flex items-center gap-2">
          {/* Метрика сегодня/всего §1.3 */}
          {totalCount > 0 ? (
            <span className={doctorSectionSubtitleClass} id="doctor-today-tasks-metric">
              {todayCount > 0 ? `сегодня ${todayCount} / всего ${totalCount}` : `всего ${totalCount}`}
            </span>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            Новая
          </Button>
        </div>
      </div>
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      {tasks.length === 0 && !loadError ? (
        <DoctorEmptyState>
          <p>Нет открытых задач</p>
        </DoctorEmptyState>
      ) : (
        <>
          {visibleTasks.length === 0 && !showAll ? (
            /* Нет задач на сегодня, но есть другие — пустое состояние с подсказкой */
            <p className="text-xs text-muted-foreground">Задач на сегодня нет</p>
          ) : (
            <ul className="m-0 flex min-h-0 list-none flex-col gap-2 overflow-y-auto p-0">
              {visibleTasks.map((task) => (
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
          {/* §1.3: «Все задачи» кнопка */}
          {hasMore ? (
            <button
              type="button"
              className="w-fit text-xs text-primary underline-offset-2 hover:underline"
              onClick={() => setShowAll(true)}
              id="doctor-today-tasks-show-all"
            >
              Все задачи ({totalCount})
            </button>
          ) : null}
          {showAll && tasks.length > 0 ? (
            <button
              type="button"
              className="w-fit text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setShowAll(false)}
            >
              Скрыть
            </button>
          ) : null}
        </>
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
