"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LabeledSwitch } from "@/components/common/form/LabeledSwitch";
import type { SpecialistTaskRow } from "@/modules/specialist-tasks/types";

export type SpecialistTaskFormValues = {
  title: string;
  description: string;
  dueAt: string;
  remindAt: string;
  isImportant: boolean;
};

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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [isImportant, setIsImportant] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setDescription(editing?.description ?? "");
    setDueAt(toLocalInput(editing?.dueAt ?? null));
    setRemindAt(toLocalInput(editing?.remindAt ?? null));
    setIsImportant(editing?.isImportant ?? false);
    setError(null);
  }, [open, editing]);

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
        const url = editing
          ? `/api/doctor/tasks/${encodeURIComponent(editing.id)}`
          : `/api/doctor/clients/${encodeURIComponent(patientUserId)}/tasks`;
        const res = await fetch(url, {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          setError("Не удалось сохранить");
          return;
        }
        onSaved();
        onOpenChange(false);
      } catch {
        setError("Ошибка сети");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Напомнить</span>
            <Input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Отмена
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending || !title.trim()}>
            {isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
