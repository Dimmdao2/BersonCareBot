'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  DoctorModal,
  DoctorModalFooter,
  DoctorModalStackedTitle,
} from '@/shared/ui/doctor/DoctorModal';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { LabeledSwitch } from '@/shared/ui/doctor/primitives/labeled-switch';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';
import { DoctorDateTimePicker } from '@/shared/ui/doctor/DoctorDateTimePicker';
import {
  DoctorCalendarPatientSearch,
  type CalendarPatientOption,
} from '@/app/app/doctor/calendar/DoctorCalendarPatientSearch';
import { formatDoctorFio } from '@/shared/lib/fio';
import { patientCardHref } from '@/app/app/doctor/patients/patientCardHref';
import { notifyDoctorTasksChanged } from '@/shared/ui/doctor/shell/doctorShellBadgeEvents';

function toLocalInput(iso: string | null, includeTime = true): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return includeTime ? `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

function fromLocalInput(value: string, endOfDay = false): string | null {
  const v = value.trim();
  if (!v) return null;
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3]),
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0,
      )
    : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export type SpecialistTaskFormContentProps = {
  /**
   * If non-empty, the task is pinned to this patient (e.g. from patient card).
   * If empty string, a patient picker is shown so the doctor can optionally link the task to a patient.
   */
  patientUserId: string;
  editing: SpecialistTaskRow | null;
  onSaved: (task: SpecialistTaskRow, patientDisplayName?: string) => void;
  onDeleted?: (taskId: string) => void;
  onClose: () => void;
  formId?: string;
  showInlineActions?: boolean;
};

export function SpecialistTaskFormContent({
  patientUserId,
  editing,
  onSaved,
  onDeleted,
  onClose,
  formId,
  showInlineActions = true,
}: SpecialistTaskFormContentProps) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [dueAt, setDueAt] = useState(() =>
    toLocalInput(editing?.dueAt ?? null, editing?.dueHasTime !== false),
  );
  const [remindAt, setRemindAt] = useState(() => toLocalInput(editing?.remindAt ?? null));
  const [isImportant, setIsImportant] = useState(editing?.isImportant ?? false);
  const [error, setError] = useState<string | null>(null);
  const [titleInvalid, setTitleInvalid] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  /**
   * Selected patient for global tasks (patientUserId prop is "").
   * Pre-populate from editing.patientUserId if available.
   */
  const [linkedPatient, setLinkedPatient] = useState<CalendarPatientOption | null>(() => {
    if (patientUserId.trim()) return null; // fixed patient — picker not shown
    if (editing?.patientUserId) {
      // We only have the id; display name won't be available here without an API call.
      // Render with a placeholder label — the picker will let doctor re-select if needed.
      return { id: editing.patientUserId, displayName: 'Загрузка…', phone: null };
    }
    return null;
  });

  // TASK-02: При редактировании задачи с привязанным пациентом в глобальном режиме
  // (patientUserId === "") начальный displayName — «Загрузка…». Здесь получаем реальное имя.
  useEffect(() => {
    if (!editing?.patientUserId || patientUserId.trim()) return;
    let cancelled = false;
    fetch(`/api/doctor/patients/${editing.patientUserId}`)
      .then((r) => r.json())
      .then(
        (data: {
          ok: boolean;
          header?: {
            identity: {
              userId: string;
              displayName: string;
              firstName: string | null;
              lastName: string | null;
              patronymic: string | null;
              phone: string | null;
            };
          };
        }) => {
          if (cancelled || !data.ok || !data.header) return;
          const identity = data.header.identity;
          setLinkedPatient({
            id: identity.userId,
            displayName: formatDoctorFio(
              {
                lastName: identity.lastName,
                firstName: identity.firstName,
                patronymic: identity.patronymic,
              },
              identity.displayName,
            ),
            phone: identity.phone,
          });
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [editing?.patientUserId, patientUserId]);

  const isGlobal = !patientUserId.trim();
  const canSelectPatient = isGlobal && !editing?.patientUserId;

  function handleSubmit() {
    if (isPending) return;
    if (!title.trim()) {
      setTitleInvalid(true);
      return;
    }
    setTitleInvalid(false);
    setError(null);
    const effectivePatientUserId = isGlobal ? (linkedPatient?.id ?? null) : patientUserId;

    const body = {
      title,
      description: description.trim() || null,
      dueAt: fromLocalInput(dueAt, !/T\d{2}:\d{2}/.test(dueAt)),
      dueHasTime: Boolean(dueAt && /T\d{2}:\d{2}/.test(dueAt)),
      remindAt: fromLocalInput(remindAt),
      isImportant,
    };
    const requestBody =
      isGlobal && !editing
        ? { ...body, patientUserId: effectivePatientUserId }
        : isGlobal && !editing?.patientUserId && effectivePatientUserId
          ? { ...body, patientUserId: effectivePatientUserId }
          : body;

    startTransition(async () => {
      try {
        const url = editing
          ? `/api/doctor/tasks/${encodeURIComponent(editing.id)}`
          : effectivePatientUserId
            ? `/api/doctor/clients/${encodeURIComponent(effectivePatientUserId)}/tasks`
            : '/api/doctor/tasks';
        const res = await fetch(url, {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
        if (!res.ok) {
          setError('Не удалось сохранить');
          return;
        }
        const data = (await res.json()) as { task?: SpecialistTaskRow };
        if (!data.task) {
          setError('Не удалось сохранить');
          return;
        }
        const linkedPatientDisplayName = linkedPatient?.displayName.trim();
        onSaved(
          data.task,
          isGlobal && linkedPatientDisplayName && linkedPatientDisplayName !== 'Загрузка…'
            ? linkedPatientDisplayName
            : undefined,
        );
        notifyDoctorTasksChanged();
        onClose();
      } catch {
        setError('Ошибка сети');
      }
    });
  }

  function handleDelete() {
    if (!editing || isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/doctor/tasks/${encodeURIComponent(editing.id)}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          setDeleteConfirmOpen(false);
          setError('Не удалось удалить задачу');
          return;
        }
        setDeleteConfirmOpen(false);
        onDeleted?.(editing.id);
        notifyDoctorTasksChanged();
        onClose();
      } catch {
        setDeleteConfirmOpen(false);
        setError('Ошибка сети');
      }
    });
  }

  const actions = (
    <>
      {editing ? (
        <Button
          type="button"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => setDeleteConfirmOpen(true)}
          disabled={isPending}
        >
          Удалить
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Отмена
        </Button>
      )}
      <Button type="submit" form={formId} disabled={isPending}>
        {isPending ? 'Сохранение…' : 'Сохранить'}
      </Button>
    </>
  );

  return (
    <form
      id={formId}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      {canSelectPatient ? (
        <DoctorCalendarPatientSearch
          value={linkedPatient}
          onChange={setLinkedPatient}
          disabled={isPending}
        />
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Задача</span>
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) setTitleInvalid(false);
          }}
          placeholder="Кратко"
          maxLength={500}
          aria-invalid={titleInvalid || undefined}
          className={titleInvalid ? 'border-destructive focus-visible:ring-destructive/30' : undefined}
        />
        {titleInvalid ? (
          <span role="alert" className="w-fit rounded bg-white px-1 text-sm text-destructive">
            Заполните это поле
          </span>
        ) : null}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Описание</span>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Подробнее"
          rows={3}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Срок</span>
        <DoctorDateTimePicker value={dueAt} onChange={setDueAt} optionalTime />
      </label>
      <LabeledSwitch
        label="Важное"
        checked={isImportant}
        onCheckedChange={setIsImportant}
        disabled={isPending}
      />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Напомнить</span>
        <DoctorDateTimePicker value={remindAt} onChange={setRemindAt} />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {showInlineActions ? <div className="flex justify-end gap-2 pt-1">{actions}</div> : null}
      {!showInlineActions ? <DoctorModalFooter>{actions}</DoctorModalFooter> : null}
      <DoctorModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Удалить задачу?"
        size="sm"
        nested
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={isPending}
            >
              Не удалять
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? 'Удаление…' : 'Удалить'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-foreground">
          Вы действительно хотите удалить задачу «{editing?.title.trim() || 'Без названия'}»?
        </p>
      </DoctorModal>
    </form>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientUserId: string;
  editing: SpecialistTaskRow | null;
  onSaved: (task: SpecialistTaskRow, patientDisplayName?: string) => void;
  onDeleted?: (taskId: string) => void;
  patientDisplayName?: string;
  patientOnSupport?: boolean;
};

export function SpecialistTaskFormDialog({
  open,
  onOpenChange,
  patientUserId,
  editing,
  onSaved,
  onDeleted,
  patientDisplayName,
  patientOnSupport = false,
}: Props) {
  const formId = useId();
  const [resolvedPatientDisplayName, setResolvedPatientDisplayName] = useState(
    patientDisplayName?.trim() || '',
  );

  useEffect(() => {
    setResolvedPatientDisplayName(patientDisplayName?.trim() || '');
    if (!editing?.patientUserId || patientDisplayName?.trim()) return;
    const controller = new AbortController();
    void fetch(`/api/doctor/patients/${encodeURIComponent(editing.patientUserId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as {
          ok?: boolean;
          header?: {
            identity?: {
              displayName?: string | null;
              firstName?: string | null;
              lastName?: string | null;
              patronymic?: string | null;
            };
          };
        };
        const identity = data.header?.identity;
        if (!data.ok || !identity) return;
        setResolvedPatientDisplayName(
          formatDoctorFio(
            {
              lastName: identity.lastName ?? null,
              firstName: identity.firstName ?? null,
              patronymic: identity.patronymic ?? null,
            },
            identity.displayName?.trim() || 'Пациент',
          ),
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [editing?.patientUserId, patientDisplayName]);

  return (
    <DoctorModal
      open={open}
      onClose={() => onOpenChange(false)}
      title={
        editing ? (
          <DoctorModalStackedTitle
            label="Изменить задачу"
            patientName={editing.patientUserId ? resolvedPatientDisplayName || 'Пациент' : undefined}
            patientHref={editing.patientUserId ? patientCardHref(editing.patientUserId) : null}
            patientOnSupport={patientOnSupport}
          />
        ) : (
          'Новая задача'
        )
      }
      size="sm"
    >
      {open ? (
        <SpecialistTaskFormContent
          key={editing?.id ?? 'new'}
          patientUserId={patientUserId}
          editing={editing}
          onSaved={onSaved}
          onDeleted={onDeleted}
          onClose={() => onOpenChange(false)}
          formId={formId}
          showInlineActions={false}
        />
      ) : null}
    </DoctorModal>
  );
}
