'use client';

import { useMemo, useState } from 'react';
import { LayoutList, ListChecks, ListTodo, Search, StickyNotePlus, X } from 'lucide-react';
import type { SpecialistTaskRow as Task } from '@/modules/specialist-tasks/types';
import { isSpecialistTaskDueOnDate } from '@/modules/specialist-tasks/taskPriority';
import { DoctorCatalogPageLayout } from '@/shared/ui/doctor/catalog/DoctorCatalogPageLayout';
import { CatalogSplitLayout } from '@/shared/ui/doctor/catalog/CatalogSplitLayout';
import { CatalogLeftPane } from '@/shared/ui/doctor/catalog/CatalogLeftPane';
import { CatalogRightPane } from '@/shared/ui/doctor/catalog/CatalogRightPane';
import { DoctorCatalogFiltersToolbar } from '@/shared/ui/doctor/DoctorCatalogFiltersToolbar';
import { DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE } from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { cn } from '@/lib/utils';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { DoctorShellChromeRegistration } from '@/shared/ui/doctor/shell/DoctorShellChromeContext';
import { SpecialistTaskRow } from '../clients/SpecialistTaskRow';
import { SpecialistTaskDetailsContent } from '../clients/SpecialistTaskDetailsDialog';
import { SpecialistTaskFormContent } from '../clients/SpecialistTaskFormDialog';

type Pane = { kind: 'details' | 'edit'; taskId: string } | { kind: 'create' } | null;
type TaskView = 'open' | 'completed' | 'all';

export function DoctorTasksPageClient({
  initialTasks,
  initialPatientNames,
  displayIana,
  todayIso,
  canMutate,
}: {
  initialTasks: Task[];
  initialPatientNames: Record<string, string>;
  displayIana: string;
  todayIso: string;
  canMutate: boolean;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [patientNames, setPatientNames] = useState(initialPatientNames);
  const [pane, setPane] = useState<Pane>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [taskView, setTaskView] = useState<TaskView>('open');
  const selected = useMemo(
    () =>
      pane && 'taskId' in pane ? (tasks.find((task) => task.id === pane.taskId) ?? null) : null,
    [pane, tasks],
  );
  const mobileHeaderActions = useMemo(
    () =>
      canMutate ? (
        <Button
          type="button"
          size="icon"
          className="size-10 shrink-0"
          aria-label="Новая задача"
          title="Новая задача"
          onClick={() => setPane({ kind: 'create' })}
        >
          <StickyNotePlus className="size-[20px]" aria-hidden />
        </Button>
      ) : null,
    [canMutate],
  );

  const matchingTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
    if (!normalizedQuery) return tasks;
    return tasks.filter((task) => {
      const patientName = task.patientUserId ? patientNames[task.patientUserId] : '';
      return [task.title, task.description ?? '', patientName]
        .join('\n')
        .toLocaleLowerCase('ru-RU')
        .includes(normalizedQuery);
    });
  }, [patientNames, query, tasks]);
  const matchingOpenTasks = useMemo(
    () => matchingTasks.filter((task) => !task.completedAt),
    [matchingTasks],
  );
  const matchingCompletedTasks = useMemo(
    () => matchingTasks.filter((task) => Boolean(task.completedAt)),
    [matchingTasks],
  );
  const visibleTaskGroups = useMemo(() => {
    if (taskView === 'open') return [{ kind: 'open' as const, tasks: matchingOpenTasks }];
    if (taskView === 'completed') {
      return [{ kind: 'completed' as const, tasks: matchingCompletedTasks }];
    }
    return [
      { kind: 'open' as const, tasks: matchingOpenTasks },
      { kind: 'completed' as const, tasks: matchingCompletedTasks },
    ];
  }, [matchingCompletedTasks, matchingOpenTasks, taskView]);
  const visibleTaskCount = visibleTaskGroups.reduce((sum, group) => sum + group.tasks.length, 0);

  const selectTaskView = (nextView: TaskView) => {
    setTaskView(nextView);
    setPane(null);
  };
  const nextTaskView: TaskView =
    taskView === 'open' ? 'completed' : taskView === 'completed' ? 'all' : 'open';
  const nextTaskViewLabel =
    nextTaskView === 'open' ? 'Открытые' : nextTaskView === 'completed' ? 'Выполненные' : 'Все';

  const taskFilters = (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск задач"
          aria-label="Поиск по задачам и пациентам"
          className="h-8 pl-8 pr-8 text-sm"
        />
        {query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setQuery('')}
            aria-label="Сбросить поиск"
            className="absolute right-0 top-0 text-muted-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1" aria-label="Статус задач">
        <Button
          type="button"
          size="icon-sm"
          aria-label={`Показать: ${nextTaskViewLabel.toLocaleLowerCase('ru-RU')}`}
          title={`Показать: ${nextTaskViewLabel.toLocaleLowerCase('ru-RU')}`}
          onClick={() => selectTaskView(nextTaskView)}
        >
          {taskView === 'open' ? (
            <LayoutList className="size-4" aria-hidden />
          ) : taskView === 'completed' ? (
            <ListChecks className="size-4" aria-hidden />
          ) : (
            <ListTodo className="size-4" aria-hidden />
          )}
        </Button>
      </div>
    </div>
  );

  const saveTask = (saved: Task, patientDisplayName?: string) => {
    setTasks((current) => {
      const exists = current.some((task) => task.id === saved.id);
      return exists
        ? current.map((task) => (task.id === saved.id ? saved : task))
        : [saved, ...current];
    });
    if (saved.patientUserId && patientDisplayName) {
      setPatientNames((current) => ({
        ...current,
        [saved.patientUserId as string]: patientDisplayName,
      }));
    }
    setPane({ kind: 'details', taskId: saved.id });
  };

  const complete = async (taskId: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/doctor/tasks/${encodeURIComponent(taskId)}/complete`, {
        method: 'POST',
      });
      if (!response.ok) {
        setError('Не удалось выполнить задачу');
        return;
      }
      const data = (await response.json()) as { task?: Task };
      if (!data.task) {
        setError('Не удалось выполнить задачу');
        return;
      }
      const completedTask = data.task;
      setTasks((current) => current.map((task) => (task.id === taskId ? completedTask : task)));
      setPane(null);
    } catch {
      setError('Ошибка сети');
    } finally {
      setBusy(false);
    }
  };

  const right =
    pane?.kind === 'create' || (pane?.kind === 'edit' && selected) ? (
      <SpecialistTaskFormContent
        key={pane.kind === 'create' ? 'new' : selected?.id}
        patientUserId=""
        editing={pane.kind === 'edit' ? selected : null}
        onSaved={saveTask}
        onClose={() => setPane(selected ? { kind: 'details', taskId: selected.id } : null)}
      />
    ) : selected ? (
      <div className="flex flex-col gap-4">
        <SpecialistTaskDetailsContent
          task={selected}
          patientDisplayName={
            selected.patientUserId ? patientNames[selected.patientUserId] : undefined
          }
          displayIana={displayIana}
          error={error}
        />
        {canMutate ? (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPane({ kind: 'edit', taskId: selected.id })}
            >
              Изменить
            </Button>
            {!selected.completedAt ? (
              <Button disabled={busy} onClick={() => void complete(selected.id)}>
                Выполнить
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">Выберите задачу</p>
    );

  return (
    <>
      <DoctorShellChromeRegistration title="Задачи" mobileActions={mobileHeaderActions} />
      <DoctorPageHeader title="Задачи" className="-mb-3 md:hidden" toolbar={taskFilters} />
      <DoctorCatalogPageLayout
        className="min-h-0 flex-1 gap-0 md:gap-3"
        toolbar={
          <DoctorCatalogFiltersToolbar
            className="hidden md:block"
            filters={taskFilters}
            end={
              canMutate ? (
                <Button type="button" size="sm" onClick={() => setPane({ kind: 'create' })}>
                  Новая задача
                </Button>
              ) : undefined
            }
          />
        }
      >
        <CatalogSplitLayout
          mobileEdgeToEdge
          className={cn(DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE, 'min-h-0 flex-1')}
          mobileView={pane ? 'detail' : 'list'}
          mobileBackSlot={
            <Button type="button" variant="ghost" onClick={() => setPane(null)}>
              Назад
            </Button>
          }
          left={
            <CatalogLeftPane
              mobileEdgeToEdge
              stickySplit={false}
              headerSlot={<p className="hidden text-sm font-medium md:block">Задачи</p>}
            >
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {visibleTaskGroups.map((group) => (
                  <section
                    key={group.kind}
                    className={cn(
                      group.kind === 'completed' && 'mt-2 border-t border-border/60 pt-2',
                    )}
                  >
                    <p
                      className={cn(
                        'px-3 pb-1 text-xs font-medium',
                        group.kind === 'completed' ? 'text-muted-foreground' : 'text-foreground',
                      )}
                    >
                      {group.kind === 'completed' ? 'Выполненные' : 'Открытых'}:{' '}
                      {group.tasks.length}
                    </p>
                    {group.tasks.length ? (
                      <ul className="flex flex-col gap-0 [&>li+li]:border-t [&>li+li]:border-border/60 md:gap-1 md:[&>li+li]:border-t-0">
                        {group.tasks.map((task) => (
                          <SpecialistTaskRow
                            key={task.id}
                            task={task}
                            displayIana={displayIana}
                            patientDisplayName={
                              task.patientUserId ? patientNames[task.patientUserId] : undefined
                            }
                            dueToday={isSpecialistTaskDueOnDate(task, todayIso, displayIana)}
                            mobileFlat
                            onOpen={(row) => setPane({ kind: 'details', taskId: row.id })}
                            active={selected?.id === task.id}
                          />
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ))}
                {!visibleTaskCount ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    {query.trim() ? 'Задачи не найдены' : 'Нет задач'}
                  </p>
                ) : null}
              </div>
            </CatalogLeftPane>
          }
          right={<CatalogRightPane>{right}</CatalogRightPane>}
        />
      </DoctorCatalogPageLayout>
    </>
  );
}
