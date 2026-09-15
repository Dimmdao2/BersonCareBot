'use client';

import { useMemo, useState } from 'react';
import { ListPlus, ListTodo } from 'lucide-react';
import type { SpecialistTaskRow as Task } from '@/modules/specialist-tasks/types';
import { isSpecialistTaskDueOnDate } from '@/modules/specialist-tasks/taskPriority';
import { DoctorCatalogPageLayout } from '@/shared/ui/doctor/catalog/DoctorCatalogPageLayout';
import { CatalogSplitLayout } from '@/shared/ui/doctor/catalog/CatalogSplitLayout';
import { CatalogLeftPane } from '@/shared/ui/doctor/catalog/CatalogLeftPane';
import { CatalogRightPane } from '@/shared/ui/doctor/catalog/CatalogRightPane';
import { DoctorSearchInput } from '@/shared/ui/doctor/DoctorSearchInput';
import { DoctorResultCount } from '@/shared/ui/doctor/DoctorResultCount';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import {
  DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE,
  DOCTOR_MOBILE_SCROLL_END_INSET_CLASS,
} from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { cn } from '@/lib/utils';
import { useViewportMinWidth } from '@/shared/hooks/useViewportMinWidth';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { DoctorShellChromeRegistration } from '@/shared/ui/doctor/shell/DoctorShellChromeContext';
import { DOCTOR_ACTIVE_FILTER_BUTTON_CLASS } from '@/shared/ui/doctor/calendar/DoctorSchedulePeriodNav';
import { DoctorDnaFlatList } from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { SpecialistTaskRow } from '../clients/SpecialistTaskRow';
import {
  SpecialistTaskDetailsContent,
  SpecialistTaskDetailsDialog,
} from '../clients/SpecialistTaskDetailsDialog';
import {
  SpecialistTaskFormContent,
  SpecialistTaskFormDialog,
} from '../clients/SpecialistTaskFormDialog';
import { notifyDoctorTasksChanged } from '@/shared/ui/doctor/shell/doctorShellBadgeEvents';
import {
  DOCTOR_MOBILE_HEADER_ICON_ACTION_CLASS,
  NAV_STRIP_ICON_STROKE,
} from '@/shared/ui/doctor/navChrome';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';

type Pane = { kind: 'details' | 'edit'; taskId: string } | null;
type TaskView = 'open' | 'completed';

export function DoctorTasksPageClient({
  initialTasks,
  initialPatientNames,
  initialPatientOnSupport,
  displayIana,
  todayIso,
  canMutate,
}: {
  initialTasks: Task[];
  initialPatientNames: Record<string, string>;
  initialPatientOnSupport: Record<string, boolean>;
  displayIana: string;
  todayIso: string;
  canMutate: boolean;
}) {
  const { patientGenPlural } = useDoctorPatientTerms();
  const [tasks, setTasks] = useState(initialTasks);
  const [patientNames, setPatientNames] = useState(initialPatientNames);
  const [pane, setPane] = useState<Pane>(null);
  const [createOpen, setCreateOpen] = useState(false);
  /**
   * Счётчик сбрасывает пустую форму в правом блоке: она смонтирована постоянно, и нажать «Новая
   * задача» после набранного наполовину текста должно давать чистый бланк, а не тот же.
   */
  const [createFormKey, setCreateFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [taskView, setTaskView] = useState<TaskView>('open');
  const hasSplitTaskDetails = useViewportMinWidth(1024);
  const selected = useMemo(
    () =>
      pane && 'taskId' in pane ? (tasks.find((task) => task.id === pane.taskId) ?? null) : null,
    [pane, tasks],
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
    return [{ kind: 'completed' as const, tasks: matchingCompletedTasks }];
  }, [matchingCompletedTasks, matchingOpenTasks, taskView]);
  const visibleTaskCount = visibleTaskGroups.reduce((sum, group) => sum + group.tasks.length, 0);

  const selectTaskView = (nextView: TaskView) => {
    setTaskView(nextView);
    setPane(null);
  };
  const showingCompletedTasks = taskView === 'completed';

  /**
   * «Новая задача» на десктопе не открывает окно: правый блок и так стоит с пустой формой, пока из
   * списка ничего не выбрано, поэтому кнопка просто снимает выбор и обнуляет форму — как в
   * «Упражнениях» (владелец 15.09). Ниже порога раздельной раскладки правого блока нет, там
   * остаётся прежнее окно создания.
   */
  const startNewTask = () => {
    if (hasSplitTaskDetails) {
      setPane(null);
      setCreateFormKey((current) => current + 1);
      return;
    }
    setCreateOpen(true);
  };

  const completedToggle = (
    <Button
      type="button"
      size="icon-sm"
      variant="outline"
      className={cn('shrink-0', showingCompletedTasks && DOCTOR_ACTIVE_FILTER_BUTTON_CLASS)}
      aria-label={showingCompletedTasks ? 'Показать открытые задачи' : 'Показать выполненные задачи'}
      title={showingCompletedTasks ? 'Показать открытые задачи' : 'Показать выполненные задачи'}
      aria-pressed={showingCompletedTasks}
      onClick={() => selectTaskView(showingCompletedTasks ? 'open' : 'completed')}
      data-testid="tasks-completed-toggle"
    >
      <ListTodo className="size-4" aria-hidden />
    </Button>
  );

  const taskSearch = (
    <DoctorSearchInput
      value={query}
      onValueChange={setQuery}
      onClear={() => setQuery('')}
      placeholder="Поиск задач"
      aria-label={`Поиск по задачам и ${patientGenPlural}`}
    />
  );

  /**
   * Мобильная строка чрома: поиск, переключатель выполненных и создание задачи. На десктопе этой
   * строки нет вовсе — поиск переехал в левый блок списка, а «Новая задача» в шапку страницы
   * (владелец 15.09: «в задачах на десктопе поиск надо сделать как в сообщениях и клиентах в левом
   * блоке — верхнюю панель убрать, переключение завершенных справа от поиска, кнопка „Новая задача“ —
   * в шапку справа»).
   */
  const mobileTaskFilters = (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      {taskSearch}
      <div className="flex shrink-0 items-center gap-1" aria-label="Статус задач">
        {completedToggle}
        {canMutate ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={DOCTOR_MOBILE_HEADER_ICON_ACTION_CLASS}
            aria-label="Новая задача"
            title="Новая задача"
            onClick={() => setCreateOpen(true)}
          >
            <ListPlus className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  );

  /** Тот же ряд, что у «Клиентов» в левом блоке: поиск и сразу справа от него фильтр состояния. */
  const desktopListControls = (
    <div className="flex min-w-0 items-center gap-1.5" data-testid="tasks-list-controls">
      {taskSearch}
      {completedToggle}
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

  const complete = async (taskId: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/doctor/tasks/${encodeURIComponent(taskId)}/complete`, {
        method: 'POST',
      });
      if (!response.ok) {
        setError('Не удалось выполнить задачу');
        return false;
      }
      const data = (await response.json()) as { task?: Task };
      if (!data.task) {
        setError('Не удалось выполнить задачу');
        return false;
      }
      const completedTask = data.task;
      setTasks((current) => current.map((task) => (task.id === taskId ? completedTask : task)));
      notifyDoctorTasksChanged();
      setPane(null);
      return true;
    } catch {
      setError('Ошибка сети');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const deleteTask = (taskId: string) => {
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setPane(null);
  };

  const right =
    pane?.kind === 'edit' && selected ? (
      <SpecialistTaskFormContent
        key={selected.id}
        patientUserId=""
        editing={selected}
        onSaved={saveTask}
        onDeleted={deleteTask}
        onClose={() => setPane({ kind: 'details', taskId: selected.id })}
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
    ) : canMutate ? (
      // Ничего не выбрано — правый блок держит пустую форму создания, а не подпись «выберите задачу»:
      // задача заводится прямо здесь, без окна поверх экрана (владелец 15.09, «все как в упражнениях»).
      <SpecialistTaskFormContent
        key={`new-${createFormKey}`}
        patientUserId=""
        editing={null}
        onSaved={saveTask}
        onClose={() => setCreateFormKey((current) => current + 1)}
      />
    ) : (
      <p className="text-sm text-muted-foreground">Выберите задачу</p>
    );

  return (
    <>
      <DoctorShellChromeRegistration title="Задачи" />
      <DoctorPageHeader
        title="Задачи"
        tabs={
          canMutate ? (
            <div className="hidden w-full justify-end md:flex">
              <Button
                type="button"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={startNewTask}
              >
                <ListPlus className="size-4" aria-hidden />
                Новая задача
              </Button>
            </div>
          ) : null
        }
        toolbar={mobileTaskFilters}
        toolbarClassName="md:hidden"
      />
      <DoctorCatalogPageLayout
        mobileEdgeToEdge
        // Верхняя панель фильтров на десктопе убрана (владелец 15.09): поиск и переключатель
        // выполненных стоят в левом блоке списка, как на «Клиентах» и «Сообщениях». Вместе с панелью
        // ушло и приклеивание к шапке — `DoctorCatalogPageLayout` приклеивает только страницы с
        // тулбаром, поэтому «Задачи» получают обычный межблочный зазор под шапкой.
        className={cn('min-h-0 flex-1 gap-0 md:gap-3')}
      >
        <CatalogSplitLayout
          className={cn(DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE, 'min-h-0 flex-1')}
          mobileView={
            !hasSplitTaskDetails && pane?.kind === 'details' ? 'list' : pane ? 'detail' : 'list'
          }
          mobileBackSlot={
            <Button type="button" variant="ghost" onClick={() => setPane(null)}>
              Назад
            </Button>
          }
          left={
            <CatalogLeftPane
              mobileEdgeToEdge
              stickySplit={false}
              // Заголовок «Задачи» из левого блока убран: он повторял заголовок страницы, а место
              // теперь занимает поиск — ровно как в левом блоке «Клиентов».
              headerSlot={desktopListControls}
            >
              {/*
                Клик по пустому месту левого блока снимает выбор и возвращает в правый блок пустую
                форму — второй, «ленивый» путь к тому же, что делает кнопка «Новая задача» (владелец
                15.09). Считается только клик мимо строки: `closest` отсекает нажатия по самим
                строкам, поиску и переключателю, иначе выбор снимался бы сразу после его установки
                (клик по строке всплыл бы сюда). Клавиатурного дубля не добавляю: с клавиатуры то же
                самое делает кнопка в шапке, а пустой контейнер в порядке обхода — мусор.
              */}
              <div
                className={cn(
                  DOCTOR_MOBILE_SCROLL_END_INSET_CLASS,
                  'flex min-h-0 flex-1 flex-col overflow-y-auto',
                )}
                onClick={(event) => {
                  if (!hasSplitTaskDetails) return;
                  if ((event.target as HTMLElement).closest('button, a, input, label')) return;
                  if (!pane) return;
                  setPane(null);
                }}
              >
                {visibleTaskGroups.map((group) => (
                  <section key={group.kind}>
                    <DoctorResultCount
                      className="px-[var(--doctor-list-inline-padding,18px)] md:px-3"
                      label={group.kind === 'completed' ? 'Выполненные' : 'Открытых'}
                      value={group.tasks.length}
                    />
                    {/* Владелец 14.09: «стандартный плоский список как на стр клиенты и
                        сообщения/комментарии» — на десктопе строки раньше стояли отдельными
                        боксами (див между ними снят здесь), теперь их разделяет обычная
                        волосяная линия `doctorDnaFlatListClass`, как на Клиентах/Сообщениях. */}
                    {group.tasks.length ? (
                      <DoctorDnaFlatList className="flex flex-col gap-0">
                        {group.tasks.map((task) => (
                          <SpecialistTaskRow
                            key={task.id}
                            task={task}
                            displayIana={displayIana}
                            patientDisplayName={
                              task.patientUserId ? patientNames[task.patientUserId] : undefined
                            }
                            patientOnSupport={
                              task.patientUserId
                                ? initialPatientOnSupport[task.patientUserId] === true
                                : false
                            }
                            dueToday={isSpecialistTaskDueOnDate(task, todayIso, displayIana)}
                            mobileFlat
                            onOpen={(row) => setPane({ kind: 'details', taskId: row.id })}
                            active={selected?.id === task.id}
                          />
                        ))}
                      </DoctorDnaFlatList>
                    ) : null}
                  </section>
                ))}
                {!visibleTaskCount ? (
                  <DoctorEmptyState>
                    {query.trim() ? 'Задачи не найдены' : 'Нет задач'}
                  </DoctorEmptyState>
                ) : null}
              </div>
            </CatalogLeftPane>
          }
          right={<CatalogRightPane>{right}</CatalogRightPane>}
        />
      </DoctorCatalogPageLayout>
      {!hasSplitTaskDetails ? (
        <SpecialistTaskDetailsDialog
          open={pane?.kind === 'details' && selected != null}
          onClose={() => setPane(null)}
          task={selected}
          patientDisplayName={
            selected?.patientUserId ? patientNames[selected.patientUserId] : undefined
          }
          patientOnSupport={
            selected?.patientUserId
              ? initialPatientOnSupport[selected.patientUserId] === true
              : false
          }
          displayIana={displayIana}
          canMutate={canMutate}
          busy={busy}
          desktopPresentation="right-sheet"
          onComplete={complete}
          onTaskSaved={saveTask}
          onTaskDeleted={deleteTask}
        />
      ) : null}
      {canMutate ? (
        <SpecialistTaskFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          patientUserId=""
          editing={null}
          onSaved={(task, patientDisplayName) => {
            saveTask(task, patientDisplayName);
            setCreateOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
