"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { SpecialistTaskRow } from "@/modules/specialist-tasks/types";
import { doctorClientOverviewPrimaryCardClass, doctorClientSectionTitleClass } from "./doctorClientCardChrome";
import { SpecialistTaskFormDialog } from "./SpecialistTaskFormDialog";
import { SpecialistTaskRow as TaskRow } from "./SpecialistTaskRow";

type Props = {
  patientUserId: string;
};

export function PatientSpecialistTasksSection({ patientUserId }: Props) {
  const [openTasks, setOpenTasks] = useState<SpecialistTaskRow[]>([]);
  const [completedTasks, setCompletedTasks] = useState<SpecialistTaskRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SpecialistTaskRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const reloadOpen = useCallback(() => {
    startTransition(async () => {
      setLoadError(null);
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(patientUserId)}/tasks`);
      if (!res.ok) {
        setLoadError("Не удалось загрузить задачи");
        return;
      }
      const data = (await res.json()) as { tasks?: SpecialistTaskRow[] };
      setOpenTasks(data.tasks ?? []);
    });
  }, [patientUserId]);

  useEffect(() => {
    reloadOpen();
  }, [reloadOpen]);

  function loadCompleted() {
    if (completedTasks !== null) return;
    startTransition(async () => {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(patientUserId)}/tasks?includeCompleted=1`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { tasks?: SpecialistTaskRow[] };
      setCompletedTasks((data.tasks ?? []).filter((t) => t.completedAt != null));
    });
  }

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function handleComplete(taskId: string) {
    startTransition(async () => {
      await fetch(`/api/doctor/tasks/${encodeURIComponent(taskId)}/complete`, { method: "POST" });
      setCompletedTasks(null);
      reloadOpen();
    });
  }

  return (
    <section
      id="doctor-client-section-tasks"
      className={`md:col-span-2 ${doctorClientOverviewPrimaryCardClass}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className={doctorClientSectionTitleClass}>Задачи</h2>
        <Button type="button" size="sm" variant="outline" onClick={openCreate}>
          Новая
        </Button>
      </div>
      {loadError ? <p className="mb-2 text-sm text-destructive">{loadError}</p> : null}
      {openTasks.length === 0 && !loadError ? (
        <p className="text-sm text-muted-foreground">Нет открытых задач</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {openTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              busy={isPending}
              onComplete={handleComplete}
              onEdit={(t) => {
                setEditing(t);
                setDialogOpen(true);
              }}
            />
          ))}
        </ul>
      )}
      <details className="mt-3" onToggle={(e) => e.currentTarget.open && loadCompleted()}>
        <summary className="cursor-pointer text-sm text-muted-foreground">Выполненные</summary>
        {completedTasks === null ? (
          <p className="mt-2 text-sm text-muted-foreground">…</p>
        ) : completedTasks.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Нет выполненных</p>
        ) : (
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {completedTasks.map((task) => (
              <li key={task.id} className="rounded-lg border border-border bg-muted/10 p-3 text-sm">
                <p className="font-medium text-foreground line-through opacity-70">{task.title}</p>
              </li>
            ))}
          </ul>
        )}
      </details>
      <SpecialistTaskFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        patientUserId={patientUserId}
        editing={editing}
        onSaved={() => {
          setCompletedTasks(null);
          reloadOpen();
        }}
      />
    </section>
  );
}
