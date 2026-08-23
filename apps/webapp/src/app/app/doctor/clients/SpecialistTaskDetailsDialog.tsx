'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { patientCardHref } from '@/app/app/doctor/patients/patientCardHref';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';
import { isSpecialistTaskOverdue } from '@/modules/specialist-tasks/taskPriority';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { doctorInlineLinkClass } from '@/shared/ui/doctor/doctorVisual';
import { SpecialistTaskFormDialog } from './SpecialistTaskFormDialog';
import { formatSpecialistTaskWhen } from './SpecialistTaskRow';

type Props = {
  open: boolean;
  onClose: () => void;
  task: SpecialistTaskRow | null;
  patientDisplayName?: string;
  displayIana?: string;
  canMutate: boolean;
  busy?: boolean;
  onComplete: (taskId: string) => Promise<boolean>;
  onTaskSaved: (task: SpecialistTaskRow, patientDisplayName?: string) => void;
};

export type SpecialistTaskDetailsContentProps = {
  task: SpecialistTaskRow;
  patientDisplayName?: string;
  displayIana?: string;
  error?: string | null;
};

/** Reusable details body for the Today modal and the Tasks split-layout detail pane. */
export function SpecialistTaskDetailsContent({
  task,
  patientDisplayName,
  displayIana,
  error,
}: SpecialistTaskDetailsContentProps) {
  const overdue = isSpecialistTaskOverdue(task);
  const dueLabel = formatSpecialistTaskWhen(task.dueAt, displayIana);

  return (
    <div className="flex flex-col gap-3 text-sm">
      {task.patientUserId ? (
        <div>
          <p className="text-xs text-muted-foreground">Пациент</p>
          <Link href={patientCardHref(task.patientUserId)} className={doctorInlineLinkClass}>
            {patientDisplayName?.trim() || 'Пациент'}
          </Link>
        </div>
      ) : null}
      <div>
        <p className="text-xs text-muted-foreground">Заголовок</p>
        <p className="text-base text-foreground">{task.title}</p>
      </div>
      {task.description?.trim() ? (
        <div>
          <p className="text-xs text-muted-foreground">Описание</p>
          <p className="whitespace-pre-wrap text-foreground">{task.description.trim()}</p>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Статус</p>
          <p className={overdue ? 'text-destructive' : 'text-foreground'}>
            {overdue ? 'Просрочено' : 'Открыта'}
          </p>
        </div>
        {dueLabel ? (
          <div>
            <p className="text-xs text-muted-foreground">Срок</p>
            <p className={overdue ? 'text-destructive' : 'text-foreground'}>{dueLabel}</p>
          </div>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function SpecialistTaskDetailsDialog({
  open,
  onClose,
  task,
  patientDisplayName,
  displayIana,
  canMutate,
  busy = false,
  onComplete,
  onTaskSaved,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEditOpen(false);
      setError(null);
    }
  }, [open]);

  if (!task) return null;

  const complete = async () => {
    setError(null);
    const completed = await onComplete(task.id);
    if (completed) {
      onClose();
      return;
    }
    setError('Не удалось выполнить задачу');
  };

  return (
    <>
      <DoctorModal
        open={open && !editOpen}
        onClose={onClose}
        title="Задача"
        size="sm"
        footer={
          canMutate ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditOpen(true)}
              >
                Изменить
              </Button>
              <Button type="button" disabled={busy} onClick={() => void complete()}>
                Выполнить
              </Button>
            </>
          ) : undefined
        }
      >
        <SpecialistTaskDetailsContent
          task={task}
          patientDisplayName={patientDisplayName}
          displayIana={displayIana}
          error={error}
        />
      </DoctorModal>

      {canMutate ? (
        <SpecialistTaskFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          patientUserId=""
          editing={task}
          onSaved={(savedTask, savedPatientDisplayName) => {
            onTaskSaved(savedTask, savedPatientDisplayName ?? patientDisplayName);
            setEditOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
