'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { cn } from '@/lib/utils';
import { getDoctorSectionItemClass } from '@/shared/ui/doctor/doctorVisual';
import { doctorInlineLinkClass } from '@/shared/ui/doctor/doctorVisual';
import type { SpecialistTaskRow as Task } from '@/modules/specialist-tasks/types';
import { isSpecialistTaskOverdue } from '@/modules/specialist-tasks/taskPriority';
import { patientCardHref } from '@/app/app/doctor/patients/patientCardHref';
import { DEFAULT_APP_DISPLAY_TIMEZONE } from '@/modules/system-settings/calendarIana';

export function formatSpecialistTaskWhen(iso: string | null, displayIana?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: displayIana ?? DEFAULT_APP_DISPLAY_TIMEZONE,
  });
}

type Props = {
  task: Task;
  onComplete?: (taskId: string) => void;
  onEdit?: (task: Task) => void;
  busy?: boolean;
  displayIana?: string;
  canMutate?: boolean;
  patientDisplayName?: string;
  dueToday?: boolean;
  onOpen?: (task: Task) => void;
  as?: 'li' | 'div';
};

export function SpecialistTaskRow({
  task,
  onComplete,
  onEdit,
  busy,
  displayIana,
  canMutate = true,
  patientDisplayName,
  dueToday = false,
  onOpen,
  as = 'li',
}: Props) {
  const overdue = isSpecialistTaskOverdue(task);
  const dueLabel = formatSpecialistTaskWhen(task.dueAt, displayIana);
  const Container = as;

  if (onOpen) {
    return (
      <Container>
        <button
          type="button"
          className={cn(
            'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            getDoctorSectionItemClass(
              overdue || dueToday || task.isImportant ? 'urgent' : 'neutral',
            ),
          )}
          onClick={() => onOpen(task)}
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            {task.patientUserId ? (
              <span className="truncate text-xs font-medium text-foreground">
                {patientDisplayName?.trim() || 'Пациент'}
              </span>
            ) : null}
            <span className="text-base font-normal text-foreground">{task.title}</span>
            {task.description?.trim() ? (
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {task.description.trim()}
              </span>
            ) : null}
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5 text-right text-xs">
            <span
              className={cn(
                'font-medium',
                overdue || dueToday ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {overdue ? 'Просрочено' : 'Открыта'}
            </span>
            {dueLabel ? (
              <span className={overdue || dueToday ? 'text-destructive' : 'text-muted-foreground'}>
                {dueLabel}
              </span>
            ) : null}
          </span>
        </button>
      </Container>
    );
  }

  return (
    <Container
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between',
        getDoctorSectionItemClass(overdue || task.isImportant ? 'urgent' : 'neutral'),
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
          {overdue ? (
            <span className="text-xs font-medium text-destructive">Просрочено</span>
          ) : null}
          <span className="text-xs text-muted-foreground">Открыта</span>
        </div>
        {/* Patient link (S2.8): show when task is linked to a patient */}
        {task.patientUserId ? (
          <p className="mt-0.5 text-xs">
            <Link
              href={patientCardHref(task.patientUserId)}
              className={doctorInlineLinkClass}
              title="Открыть карточку пациента"
            >
              Пациент
            </Link>
          </p>
        ) : null}
        {formatSpecialistTaskWhen(task.createdAt, displayIana) ? (
          <p className="text-xs text-muted-foreground">
            Поставлена: {formatSpecialistTaskWhen(task.createdAt, displayIana)}
          </p>
        ) : null}
        {dueLabel ? <p className="text-xs text-muted-foreground">Срок: {dueLabel}</p> : null}
        {task.description?.trim() ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{task.description.trim()}</p>
        ) : null}
      </div>
      {canMutate && onComplete && onEdit ? (
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onEdit(task)}
          >
            Изменить
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={() => onComplete(task.id)}>
            Выполнить
          </Button>
        </div>
      ) : null}
    </Container>
  );
}
