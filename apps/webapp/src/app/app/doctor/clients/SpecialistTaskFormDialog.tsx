'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
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

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
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
  onClose: () => void;
  formId?: string;
  showInlineActions?: boolean;
};

export function SpecialistTaskFormContent({
  patientUserId,
  editing,
  onSaved,
  onClose,
  formId,
  showInlineActions = true,
}: SpecialistTaskFormContentProps) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [dueAt, setDueAt] = useState(() => toLocalInput(editing?.dueAt ?? null));
  const [remindAt, setRemindAt] = useState(() => toLocalInput(editing?.remindAt ?? null));
  const [isImportant, setIsImportant] = useState(editing?.isImportant ?? false);
  const [error, setError] = useState<string | null>(null);
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

  function handleSubmit() {
    if (isPending || !title.trim()) return;
    setError(null);
    const effectivePatientUserId = isGlobal ? (linkedPatient?.id ?? null) : patientUserId;

    const body = {
      title,
      description: description.trim() || null,
      dueAt: fromLocalInput(dueAt),
      remindAt: fromLocalInput(remindAt),
      isImportant,
    };

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
          body: JSON.stringify(
            isGlobal && !editing ? { ...body, patientUserId: effectivePatientUserId } : body,
          ),
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
        onClose();
      } catch {
        setError('Ошибка сети');
      }
    });
  }

  return (
    <form
      id={formId}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      {/* Patient picker: shown only for global tasks (patientUserId === "") */}
      {isGlobal ? (
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
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Кратко"
          maxLength={500}
          required
        />
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
        <DoctorDateTimePicker value={dueAt} onChange={setDueAt} />
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
      {showInlineActions ? (
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Отмена
          </Button>
          <Button type="submit" disabled={isPending || !title.trim()}>
            {isPending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientUserId: string;
  editing: SpecialistTaskRow | null;
  onSaved: (task: SpecialistTaskRow, patientDisplayName?: string) => void;
};

export function SpecialistTaskFormDialog({
  open,
  onOpenChange,
  patientUserId,
  editing,
  onSaved,
}: Props) {
  const formId = useId();

  return (
    <DoctorModal
      open={open}
      onClose={() => onOpenChange(false)}
      title={editing ? 'Изменить задачу' : 'Новая задача'}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" form={formId}>
            Сохранить
          </Button>
        </>
      }
    >
      {open ? (
        <SpecialistTaskFormContent
          key={editing?.id ?? 'new'}
          patientUserId={patientUserId}
          editing={editing}
          onSaved={onSaved}
          onClose={() => onOpenChange(false)}
          formId={formId}
          showInlineActions={false}
        />
      ) : null}
    </DoctorModal>
  );
}
