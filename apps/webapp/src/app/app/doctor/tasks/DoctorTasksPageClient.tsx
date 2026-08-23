'use client';

import { useMemo, useState } from 'react';
import type { SpecialistTaskRow as Task } from '@/modules/specialist-tasks/types';
import { isSpecialistTaskDueOnDate } from '@/modules/specialist-tasks/taskPriority';
import { DoctorCatalogPageLayout } from '@/shared/ui/doctor/catalog/DoctorCatalogPageLayout';
import { CatalogSplitLayout } from '@/shared/ui/doctor/catalog/CatalogSplitLayout';
import { CatalogLeftPane } from '@/shared/ui/doctor/catalog/CatalogLeftPane';
import { CatalogRightPane } from '@/shared/ui/doctor/catalog/CatalogRightPane';
import {
  DoctorCatalogFiltersToolbar,
  doctorCatalogToolbarPrimaryActionClassName,
} from '@/shared/ui/doctor/DoctorCatalogFiltersToolbar';
import { DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE } from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { SpecialistTaskRow } from '../clients/SpecialistTaskRow';
import { SpecialistTaskDetailsContent } from '../clients/SpecialistTaskDetailsDialog';
import { SpecialistTaskFormContent } from '../clients/SpecialistTaskFormDialog';

type Pane = { kind: 'details' | 'edit'; taskId: string } | { kind: 'create' } | null;

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
  const selected = useMemo(
    () => (pane && 'taskId' in pane ? (tasks.find((task) => task.id === pane.taskId) ?? null) : null),
    [pane, tasks],
  );

  const saveTask = (saved: Task, patientDisplayName?: string) => {
    setTasks((current) => {
      const exists = current.some((task) => task.id === saved.id);
      return exists ? current.map((task) => (task.id === saved.id ? saved : task)) : [saved, ...current];
    });
    if (saved.patientUserId && patientDisplayName) {
      setPatientNames((current) => ({ ...current, [saved.patientUserId as string]: patientDisplayName }));
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
      setTasks((current) => current.filter((task) => task.id !== taskId));
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
          patientDisplayName={selected.patientUserId ? patientNames[selected.patientUserId] : undefined}
          displayIana={displayIana}
          error={error}
        />
        {canMutate ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setPane({ kind: 'edit', taskId: selected.id })}>Изменить</Button>
            <Button disabled={busy} onClick={() => void complete(selected.id)}>Выполнить</Button>
          </div>
        ) : null}
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">Выберите задачу</p>
    );

  return (
    <DoctorCatalogPageLayout
      toolbar={
        <DoctorCatalogFiltersToolbar
          filters={<span className="text-sm text-muted-foreground">Открытых: {tasks.length}</span>}
          end={canMutate ? <button type="button" className={doctorCatalogToolbarPrimaryActionClassName} onClick={() => setPane({ kind: 'create' })}>Новая задача</button> : undefined}
        />
      }
    >
      <CatalogSplitLayout
        className={DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE}
        mobileView={pane ? 'detail' : 'list'}
        mobileBackSlot={<Button type="button" variant="ghost" onClick={() => setPane(null)}>Назад</Button>}
        left={
          <CatalogLeftPane stickySplit={false} headerSlot={<p className="text-sm font-medium">Задачи</p>}>
            {tasks.length ? <ul className="flex flex-col gap-1 overflow-y-auto">{tasks.map((task) => <SpecialistTaskRow key={task.id} task={task} displayIana={displayIana} patientDisplayName={task.patientUserId ? patientNames[task.patientUserId] : undefined} dueToday={isSpecialistTaskDueOnDate(task, todayIso, displayIana)} onOpen={(row) => setPane({ kind: 'details', taskId: row.id })} active={selected?.id === task.id} />)}</ul> : <p className="p-3 text-sm text-muted-foreground">Нет открытых задач</p>}
          </CatalogLeftPane>
        }
        right={<CatalogRightPane>{right}</CatalogRightPane>}
      />
    </DoctorCatalogPageLayout>
  );
}
