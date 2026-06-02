"use client";

import { useCallback, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { SpecialistTaskRow } from "@/modules/specialist-tasks/types";
import { SpecialistTaskFormDialog } from "./clients/SpecialistTaskFormDialog";
import { SpecialistTaskRow as TaskRow } from "./clients/SpecialistTaskRow";

export function DoctorGlobalTasksSection({ initialTasks }: { initialTasks: SpecialistTaskRow[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<SpecialistTaskRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = useCallback(() => {
    startTransition(async () => {
      setLoadError(null);
      const res = await fetch("/api/doctor/tasks");
      if (!res.ok) {
        setLoadError("Не удалось загрузить задачи");
        return;
      }
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
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      {tasks.length === 0 && !loadError ? (
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
      <SpecialistTaskFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        patientUserId=""
        editing={null}
        onSaved={reload}
      />
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
