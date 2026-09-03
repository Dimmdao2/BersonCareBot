'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import { patientCardHref } from '@/app/app/doctor/patients/patientCardHref';
import { cn } from '@/lib/utils';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';
import { isSpecialistTaskOverdue } from '@/modules/specialist-tasks/taskPriority';
import { DEFAULT_APP_DISPLAY_TIMEZONE } from '@/modules/system-settings/calendarIana';
import {
  DoctorModal,
  type DoctorModalDesktopPresentation,
} from '@/shared/ui/doctor/DoctorModal';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  doctorBodyTextClass,
  doctorInlineLinkClass,
  doctorPageTitleClass,
  doctorSecondaryListTextClass,
} from '@/shared/ui/doctor/doctorVisual';
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
  desktopPresentation?: DoctorModalDesktopPresentation;
  onComplete: (taskId: string) => Promise<boolean>;
  onTaskSaved: (task: SpecialistTaskRow, patientDisplayName?: string) => void;
};

export type SpecialistTaskDetailsContentProps = {
  task: SpecialistTaskRow;
  patientDisplayName?: string;
  displayIana?: string;
  error?: string | null;
};

function formatDaysRu(days: number): string {
  const mod100 = days % 100;
  const mod10 = days % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${days} дней`;
  if (mod10 === 1) return `${days} день`;
  if (mod10 >= 2 && mod10 <= 4) return `${days} дня`;
  return `${days} дней`;
}

function getOverdueDays(
  dueAt: string | null,
  nowMs: number,
  displayIana?: string,
): number | null {
  if (!dueAt) return null;
  const zone = displayIana ?? DEFAULT_APP_DISPLAY_TIMEZONE;
  const dueAtMs = Date.parse(dueAt);
  if (Number.isNaN(dueAtMs)) return null;
  const dueDay = DateTime.fromMillis(dueAtMs).setZone(zone).startOf('day');
  const today = DateTime.fromMillis(nowMs).setZone(zone).startOf('day');
  if (!dueDay.isValid || !today.isValid) return null;
  return Math.max(1, Math.floor(today.diff(dueDay, 'days').days));
}

/** Reusable details body for the Today modal and the Tasks split-layout detail pane. */
export function SpecialistTaskDetailsContent({
  task,
  patientDisplayName,
  displayIana,
  error,
}: SpecialistTaskDetailsContentProps) {
  const [nowMs] = useState(() => Date.now());
  const overdue = isSpecialistTaskOverdue(task, nowMs);
  const completed = Boolean(task.completedAt);
  const dueLabel = formatSpecialistTaskWhen(task.dueAt, displayIana);
  const reminderLabel = formatSpecialistTaskWhen(task.remindAt, displayIana);
  const reminderAtMs = task.remindAt ? Date.parse(task.remindAt) : Number.NaN;
  const reminderPassed = !Number.isNaN(reminderAtMs) && reminderAtMs < nowMs;
  const overdueDays = overdue ? getOverdueDays(task.dueAt, nowMs, displayIana) : null;
  const statusLabel = completed
    ? 'Выполнена'
    : overdue
      ? `Просрочено${overdueDays == null ? '' : ` ${formatDaysRu(overdueDays)}`}`
      : 'Открыта';

  return (
    <div className="flex flex-col gap-3">
      {task.patientUserId ? (
        <div>
          <p className={doctorSecondaryListTextClass}>Пациент</p>
          <Link
            href={patientCardHref(task.patientUserId)}
            className={cn(doctorPageTitleClass, 'font-normal', doctorInlineLinkClass)}
          >
            {patientDisplayName?.trim() || 'Пациент'}
          </Link>
        </div>
      ) : null}
      <div>
        <p className={doctorSecondaryListTextClass}>Задача</p>
        <p className={cn(doctorBodyTextClass, 'font-medium')}>{task.title}</p>
      </div>
      {task.description?.trim() ? (
        <div>
          <p className={doctorSecondaryListTextClass}>Описание</p>
          <p className={cn(doctorBodyTextClass, 'whitespace-pre-wrap')}>
            {task.description.trim()}
          </p>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {dueLabel ? (
          <div>
            <p className={doctorSecondaryListTextClass}>Срок</p>
            <p className={cn(doctorBodyTextClass, overdue && 'text-destructive')}>{dueLabel}</p>
          </div>
        ) : null}
        <div className={cn(!dueLabel && 'col-start-2')}>
          <p className={doctorSecondaryListTextClass}>Статус</p>
          <p className={cn(doctorBodyTextClass, overdue && 'text-destructive')}>{statusLabel}</p>
        </div>
      </div>
      {reminderLabel ? (
        <div
          className={cn(
            reminderPassed ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          <div className="flex items-center gap-1">
            <Bell className="size-3.5 shrink-0" aria-hidden />
            <p className={cn(doctorSecondaryListTextClass, 'text-current')}>Напомнить</p>
          </div>
          <p className={cn(doctorBodyTextClass, 'text-current')}>{reminderLabel}</p>
        </div>
      ) : null}
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
  desktopPresentation,
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

  const complete = async () => {
    if (!task) return;
    setError(null);
    const completed = await onComplete(task.id);
    if (completed) {
      onClose();
      return;
    }
    setError('Не удалось выполнить задачу');
  };

  return (
    <DoctorModal
      open={open && task != null}
      onClose={onClose}
      title="Задача"
      size="sm"
      desktopPresentation={desktopPresentation}
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
            {task && !task.completedAt ? (
              <Button type="button" disabled={busy} onClick={() => void complete()}>
                Выполнить
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    >
      {task ? (
        <SpecialistTaskDetailsContent
          task={task}
          patientDisplayName={patientDisplayName}
          displayIana={displayIana}
          error={error}
        />
      ) : null}
      {canMutate && task ? (
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
    </DoctorModal>
  );
}
