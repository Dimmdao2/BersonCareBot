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
  const [tasks, setTasks] = useState<SpecialistTaskRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SpecialistTaskRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await fetch(`/api/doctor/clients/${encodeURIComponent(patientUserId)}/tasks`);
      if (!res.ok) return;
      const data = (await res.json()) as { tasks?: SpecialistTaskRow[] };
      setTasks(data.tasks ?? []);
    });
  }, [patientUserId]);

  useEffect(() => {
    reload();
  }, [reload]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function handleComplete(taskId: string) {
    startTransition(async () => {
      await fetch(`/api/doctor/tasks/${encodeURIComponent(taskId)}/complete`, { method: "POST" });
      reload();
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
                setDialogOpen(true);
              }}
            />
          ))}
        </ul>
      )}
      <SpecialistTaskFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        patientUserId={patientUserId}
        editing={editing}
        onSaved={reload}
      />
    </section>
  );
}
