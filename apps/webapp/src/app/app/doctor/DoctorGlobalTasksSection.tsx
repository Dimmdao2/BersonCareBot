"use client";

import { useCallback, useState, useTransition } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { doctorSectionSubtitleClass } from "@/shared/ui/doctor/doctorVisual";
import { KpiPreviewModal } from "@/shared/ui/doctor/KpiPreviewModal";
import type { SpecialistTaskRow } from "@/modules/specialist-tasks/types";
import { cn } from "@/lib/utils";
import { DEFAULT_APP_DISPLAY_TIMEZONE } from "@/modules/system-settings/calendarIana";
import { SpecialistTaskFormDialog } from "./clients/SpecialistTaskFormDialog";
import { SpecialistTaskRow as TaskRow } from "./clients/SpecialistTaskRow";

/**
 * Сортировка: сначала к выполнению (просроченные + сегодня) — по дате asc (самые
 * просроченные сверху), затем будущие по дате, затем без срока. (R2)
 */
function sortTasksByDeadline(tasks: SpecialistTaskRow[], todayIso: string): SpecialistTaskRow[] {
  const rank = (t: SpecialistTaskRow): number => {
    if (t.dueAt == null) return 2;
    return t.dueAt.slice(0, 10) <= todayIso ? 0 : 1;
  };
  return [...tasks].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (a.dueAt == null || b.dueAt == null) return 0;
    return a.dueAt.localeCompare(b.dueAt);
  });
}

/**
 * Задачи к выполнению на сегодня = дедлайн сегодня ИЛИ просроченные (вчера и раньше).
 * R2: «просрочено так просрочено» — просроченные не скрываем, показываем вместе с сегодняшними.
 * Сравнение по дате-части ISO (YYYY-MM-DD) лексикографически корректно.
 */
function filterTodayTasks(tasks: SpecialistTaskRow[], todayIso: string): SpecialistTaskRow[] {
  return tasks.filter((t) => t.dueAt != null && t.dueAt.slice(0, 10) <= todayIso);
}

function formatWhenShort(iso: string | null, displayIana?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: displayIana ?? DEFAULT_APP_DISPLAY_TIMEZONE,
  });
}

export function DoctorGlobalTasksSection({
  initialTasks,
  initialTasksTotal,
  todayIso,
  displayIana,
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
  /** IANA timezone for display — threads from parent instead of hardcoding Europe/Moscow. */
  displayIana?: string;
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
  const [taskModalOpen, setTaskModalOpen] = useState(false);

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
          {/* Метрика сегодня/всего §1.3 — click opens KpiPreviewModal (S2.8) */}
          {totalCount > 0 ? (
            <button
              type="button"
              className={cn(
                doctorSectionSubtitleClass,
                "underline-offset-2 hover:underline cursor-pointer",
              )}
              id="doctor-today-tasks-metric"
              onClick={() => setTaskModalOpen(true)}
              title="Просмотреть все задачи"
            >
              {todayCount > 0 ? `сегодня ${todayCount} / всего ${totalCount}` : `всего ${totalCount}`}
            </button>
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

      {/* KpiPreviewModal: Задачи (S2.8) */}
      <KpiPreviewModal<SpecialistTaskRow>
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        title="Задачи"
        count={totalCount}
        items={tasks}
        renderItem={(task) => (
          <TaskRow
            task={task}
            busy={isPending}
            onComplete={(id) => {
              handleComplete(id);
              setTaskModalOpen(false);
            }}
            onEdit={(t) => {
              setEditing(t);
              setEditOpen(true);
              setTaskModalOpen(false);
            }}
          />
        )}
        searchPlaceholder="Поиск по задаче…"
        searchPredicate={(task, q) =>
          task.title.toLowerCase().includes(q.toLowerCase()) ||
          (task.description?.toLowerCase().includes(q.toLowerCase()) ?? false)
        }
        quickFilters={[
          {
            label: "Сегодня",
            predicate: (task) =>
              task.dueAt != null && task.dueAt.slice(0, 10) <= todayIso,
          },
          {
            label: "Важные",
            predicate: (task) => task.isImportant,
          },
        ]}
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">Нет открытых задач</p>
        }
      />

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
