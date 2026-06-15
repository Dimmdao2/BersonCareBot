"use client";

import { useState, useTransition } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/doctor/primitives/dialog";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import { LabeledSwitch } from "@/components/common/form/LabeledSwitch";
import type { SpecialistTaskRow } from "@/modules/specialist-tasks/types";
import { DoctorDateTimePicker } from "@/shared/ui/doctor/DoctorDateTimePicker";

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
  patientUserId: string;
  editing: SpecialistTaskRow | null;
  onSaved: () => void;
  onClose: () => void;
};

function SpecialistTaskFormFields({ patientUserId, editing, onSaved, onClose }: FormFieldsProps) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [dueAt, setDueAt] = useState(() => toLocalInput(editing?.dueAt ?? null));
  const [remindAt, setRemindAt] = useState(() => toLocalInput(editing?.remindAt ?? null));
  const [isImportant, setIsImportant] = useState(editing?.isImportant ?? false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    const body = {
      title,
      description: description.trim() || null,
      dueAt: fromLocalInput(dueAt),
      remindAt: fromLocalInput(remindAt),
      isImportant,
    };
    startTransition(async () => {
      try {
        const isGlobal = !patientUserId.trim();
        const url = editing
          ? `/api/doctor/tasks/${encodeURIComponent(editing.id)}`
          : isGlobal
            ? "/api/doctor/tasks"
            : `/api/doctor/clients/${encodeURIComponent(patientUserId)}/tasks`;
        const res = await fetch(url, {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isGlobal && !editing ? { ...body, patientUserId: null } : body,
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
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{editing ? "Изменить задачу" : "Новая задача"}</DialogTitle>
      </DialogHeader>
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
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Отмена
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={isPending || !title.trim()}>
          {isPending ? "Сохранение…" : "Сохранить"}
        </Button>
      </DialogFooter>
    </DialogContent>
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <SpecialistTaskFormFields
          key={editing?.id ?? "new"}
          patientUserId={patientUserId}
          editing={editing}
          onSaved={onSaved}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}
