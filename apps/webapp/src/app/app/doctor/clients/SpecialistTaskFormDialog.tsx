"use client";

import { useState, useTransition } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { DoctorModal } from "@/shared/ui/doctor/DoctorModal";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import { LabeledSwitch } from "@/components/common/form/LabeledSwitch";
import type { SpecialistTaskRow } from "@/modules/specialist-tasks/types";
import { DoctorDateTimePicker } from "@/shared/ui/doctor/DoctorDateTimePicker";
import {
  DoctorCalendarPatientSearch,
  type CalendarPatientOption,
} from "@/app/app/doctor/calendar/DoctorCalendarPatientSearch";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type FormFieldsProps = {
  /**
   * If non-empty, the task is pinned to this patient (e.g. from patient card).
   * If empty string, a patient picker is shown so the doctor can optionally link the task to a patient.
   */
  patientUserId: string;
  editing: SpecialistTaskRow | null;
  onSaved: () => void;
  onClose: () => void;
};

function SpecialistTaskFormContent({ patientUserId, editing, onSaved, onClose }: FormFieldsProps) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
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
      return { id: editing.patientUserId, displayName: "Загрузка…", phone: null };
    }
    return null;
  });

  const isGlobal = !patientUserId.trim();

  function handleSubmit() {
    setError(null);
    const effectivePatientUserId = isGlobal
      ? (linkedPatient?.id ?? null)
      : patientUserId;

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
            : "/api/doctor/tasks";
        const res = await fetch(url, {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isGlobal && !editing
              ? { ...body, patientUserId: effectivePatientUserId }
              : body,
          ),
        });
        if (!res.ok) {
          setError("Не удалось сохранить");
          return;
        }
        onSaved();
        onClose();
      } catch {
        setError("Ошибка сети");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Кратко"
        maxLength={500}
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Подробнее"
        rows={3}
      />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Срок</span>
        <DoctorDateTimePicker value={dueAt} onChange={setDueAt} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Напомнить</span>
        <DoctorDateTimePicker value={remindAt} onChange={setRemindAt} />
      </label>
      <LabeledSwitch
        label="Важное"
        checked={isImportant}
        onCheckedChange={setIsImportant}
        disabled={isPending}
      />
      {/* Patient picker: shown only for global tasks (patientUserId === "") */}
      {isGlobal ? (
        <DoctorCalendarPatientSearch
          value={linkedPatient}
          onChange={setLinkedPatient}
          disabled={isPending}
        />
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Отмена
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={isPending || !title.trim()}>
          {isPending ? "Сохранение…" : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientUserId: string;
  editing: SpecialistTaskRow | null;
  onSaved: () => void;
};

export function SpecialistTaskFormDialog({
  open,
  onOpenChange,
  patientUserId,
  editing,
  onSaved,
}: Props) {
  return (
    <DoctorModal
      open={open}
      onClose={() => onOpenChange(false)}
      title={editing ? "Изменить задачу" : "Новая задача"}
      size="sm"
    >
      {open ? (
        <SpecialistTaskFormContent
          key={editing?.id ?? "new"}
          patientUserId={patientUserId}
          editing={editing}
          onSaved={onSaved}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </DoctorModal>
  );
}
