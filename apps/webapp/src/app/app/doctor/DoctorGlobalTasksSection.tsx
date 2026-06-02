"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
import { SpecialistTaskFormDialog } from "./clients/SpecialistTaskFormDialog";
import { SpecialistTaskRow as TaskRow } from "./clients/SpecialistTaskRow";

function fromLocalInput(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function GlobalTaskCreateDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [isImportant, setIsImportant] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setDueAt("");
    setRemindAt("");
    setIsImportant(false);
    setError(null);
  }, [open]);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/doctor/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description.trim() || null,
          patientUserId: null,
          dueAt: fromLocalInput(dueAt),
          remindAt: fromLocalInput(remindAt),
          isImportant,
        }),
      });
      if (!res.ok) {
        setError("Не удалось сохранить");
        return;
      }
      onSaved();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Новая задача</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Кратко" />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Срок</span>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Напомнить</span>
            <Input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
          </label>
          <LabeledSwitch label="Важное" checked={isImportant} onCheckedChange={setIsImportant} disabled={isPending} />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Отмена
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending || !title.trim()}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DoctorGlobalTasksSection({ initialTasks }: { initialTasks: SpecialistTaskRow[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<SpecialistTaskRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await fetch("/api/doctor/tasks");
      if (!res.ok) return;
      const data = (await res.json()) as { tasks?: SpecialistTaskRow[] };
      setTasks(data.tasks ?? []);
    });
  }, []);

  function handleComplete(taskId: string) {
    startTransition(async () => {
      await fetch(`/api/doctor/tasks/${encodeURIComponent(taskId)}/complete`, { method: "POST" });
      reload();
    });
  }

  return (
    <section
      id="doctor-today-global-tasks"
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Мои задачи</h2>
        <Button type="button" size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          Новая
        </Button>
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет открытых задач</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              busy={isPending}
              onComplete={handleComplete}
              onEdit={(t) => {
                setEditing(t);
                setEditOpen(true);
              }}
            />
          ))}
        </ul>
      )}
      <GlobalTaskCreateDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={reload} />
      {editing ? (
        <SpecialistTaskFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          patientUserId=""
          editing={editing}
          onSaved={() => {
            reload();
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}
