'use client';

import { useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import { DoctorSection, DoctorSectionTitle } from '@/shared/ui/doctor/DoctorSection';
import { KpiPreviewModal } from '@/shared/ui/doctor/KpiPreviewModal';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';
import {
  isSpecialistTaskDueOnDate,
  isSpecialistTaskOverdue,
} from '@/modules/specialist-tasks/taskPriority';
import { cn } from '@/lib/utils';
import { SpecialistTaskFormDialog } from './clients/SpecialistTaskFormDialog';
import { SpecialistTaskRow as TaskRow } from './clients/SpecialistTaskRow';
import { SpecialistTaskDetailsDialog } from './clients/SpecialistTaskDetailsDialog';

/** How many non-overdue tasks to show in the compact preview before collapsing into "Все задачи". */
const NEAREST_UPCOMING_PREVIEW_LIMIT = 3;

/**
 * Owner punch-list (2026-07-25) item 1: single ordering shared by the compact preview and the
 * full-list modal — no more separate "today only" concept.
 * Rank 0: overdue (any due date in the past, real time — matches SpecialistTaskRow's own red
 *         "Просрочено" badge) — earliest due date first (most overdue on top).
 * Rank 1: has a future/today due date — nearest first.
 * Rank 2: no due date at all — by creation date (oldest first), always last.
 * A task with a linked patient is included exactly like any other — the previous bug excluded
 * patient-linked and date-less tasks entirely (see loadDoctorTodayDashboard.ts / tasks route.ts).
 */
function sortTasksForDisplay(tasks: SpecialistTaskRow[]): SpecialistTaskRow[] {
  const rank = (t: SpecialistTaskRow): 0 | 1 | 2 => {
    if (isSpecialistTaskOverdue(t)) return 0;
    if (t.dueAt != null) return 1;
    return 2;
  };
  return [...tasks].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 2) return a.createdAt.localeCompare(b.createdAt);
    return (a.dueAt ?? '').localeCompare(b.dueAt ?? '');
  });
}

export function DoctorGlobalTasksSection({
  tasks,
  taskPatientNames,
  todayIso,
  displayIana,
  className,
  available,
  readable = available,
  busy = false,
  onComplete,
  onTaskSaved,
}: {
  tasks: SpecialistTaskRow[];
  taskPatientNames: Record<string, string>;
  /** Дата сегодня в формате YYYY-MM-DD (из сервера) — используется только для quick-filter «Сегодня» в модалке. */
  todayIso: string;
  /** IANA timezone for display — threads from parent instead of hardcoding Europe/Moscow. */
  displayIana?: string;
  className?: string;
  available: boolean;
  readable?: boolean;
  busy?: boolean;
  onComplete: (taskId: string) => Promise<boolean>;
  onTaskSaved: (task: SpecialistTaskRow, patientDisplayName?: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const sortedTasks = sortTasksForDisplay(tasks);
  const tasksTotal = tasks.length;
  const selectedTask = selectedTaskId
    ? (tasks.find((task) => task.id === selectedTaskId) ?? null)
    : null;
  const overdueCount = sortedTasks.filter((t) => isSpecialistTaskOverdue(t)).length;
  // Owner punch-list item 1: ALL overdue tasks pinned at top (red, via SpecialistTaskRow) +
  // the nearest N upcoming; everything else is reachable via the "Все задачи" button/modal.
  const visibleTasks = sortedTasks.slice(0, overdueCount + NEAREST_UPCOMING_PREVIEW_LIMIT);
  const hasMore = tasksTotal > visibleTasks.length;

  if (!readable) return null;

  return (
    <DoctorSection id="doctor-today-global-tasks" className={cn('h-full gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <DoctorSectionTitle>Задачи</DoctorSectionTitle>
        {/* Owner punch-list item 1: top «всего» metric removed — it duplicated the bottom
            «Все задачи» entry point onto the same modal. */}
        {available ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            Новая
          </Button>
        ) : null}
      </div>
      {tasks.length === 0 ? (
        <DoctorEmptyState>
          <p>Нет открытых задач</p>
        </DoctorEmptyState>
      ) : (
        <>
          <ul className="m-0 flex min-h-0 list-none flex-col gap-2 overflow-y-auto p-0">
            {visibleTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                displayIana={displayIana}
                patientDisplayName={
                  task.patientUserId ? taskPatientNames[task.patientUserId] : undefined
                }
                dueToday={
                  displayIana ? isSpecialistTaskDueOnDate(task, todayIso, displayIana) : false
                }
                canMutate={available}
                onOpen={(selected) => setSelectedTaskId(selected.id)}
              />
            ))}
          </ul>
          {/* §1.3 / owner punch-list item 1: «Все задачи» — единственная точка входа в полный список (модалка с поиском). */}
          {hasMore ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto w-fit p-0 text-xs underline-offset-2"
              onClick={() => setTaskModalOpen(true)}
              id="doctor-today-tasks-show-all"
            >
              Все задачи ({tasksTotal})
            </Button>
          ) : null}
        </>
      )}

      {/* KpiPreviewModal: Задачи (S2.8) */}
      <KpiPreviewModal<SpecialistTaskRow>
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        title="Задачи"
        count={tasksTotal}
        items={sortedTasks}
        renderItem={(task) => (
          <TaskRow
            task={task}
            as="div"
            displayIana={displayIana}
            patientDisplayName={
              task.patientUserId ? taskPatientNames[task.patientUserId] : undefined
            }
            dueToday={displayIana ? isSpecialistTaskDueOnDate(task, todayIso, displayIana) : false}
            canMutate={available}
            onOpen={(selected) => {
              setTaskModalOpen(false);
              setSelectedTaskId(selected.id);
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
            label: 'Просрочено',
            predicate: (task) => isSpecialistTaskOverdue(task),
          },
          {
            label: 'Сегодня',
            predicate: (task) => task.dueAt != null && task.dueAt.slice(0, 10) <= todayIso,
          },
          {
            label: 'Важные',
            predicate: (task) => task.isImportant,
          },
        ]}
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">Нет открытых задач</p>
        }
      />

      {available ? (
        <SpecialistTaskFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          patientUserId=""
          editing={null}
          onSaved={onTaskSaved}
        />
      ) : null}
      <SpecialistTaskDetailsDialog
        open={selectedTask != null}
        onClose={() => setSelectedTaskId(null)}
        task={selectedTask}
        patientDisplayName={
          selectedTask?.patientUserId ? taskPatientNames[selectedTask.patientUserId] : undefined
        }
        displayIana={displayIana}
        canMutate={available}
        busy={busy}
        onComplete={onComplete}
        onTaskSaved={onTaskSaved}
      />
    </DoctorSection>
  );
}
