"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/ui/doctor/primitives/dialog";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
};

function statusLabel(status: TreatmentProgramInstanceSummary["status"]): string {
  return status === "completed" ? "Завершена" : "Активна";
}

function statusClass(status: TreatmentProgramInstanceSummary["status"]): string {
  return status === "completed"
    ? "bg-muted text-muted-foreground"
    : "bg-primary/10 text-primary";
}

export function ProgramHistoryModal({ open, onOpenChange, userId }: Props) {
  const [instances, setInstances] = useState<TreatmentProgramInstanceSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync reset to loading state when dialog opens
    setInstances(null);
    setError(false);
    fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/treatment-program-instances`)
      .then((r) => r.json())
      .then((data: { ok?: boolean; items?: TreatmentProgramInstanceSummary[] }) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.items)) {
          setInstances(data.items);
        } else {
          setError(true);
          setInstances([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setInstances([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const pastInstances = instances?.filter((i) => i.status === "completed") ?? [];
  const activeInstances = instances?.filter((i) => i.status !== "completed") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>История программ</DialogTitle>
          <DialogDescription>Все программы лечения пациента.</DialogDescription>
        </DialogHeader>

        {instances === null ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">
            Не удалось загрузить программы.
          </p>
        ) : instances.length === 0 ? (
          <p className="text-sm text-muted-foreground">Программ пока нет.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {activeInstances.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Активные
                </p>
                <ul className="space-y-1.5">
                  {activeInstances.map((inst) => (
                    <ProgramInstanceRow key={inst.id} inst={inst} userId={userId} />
                  ))}
                </ul>
              </div>
            ) : null}
            {pastInstances.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Завершённые
                </p>
                <ul className="space-y-1.5">
                  {pastInstances.map((inst) => (
                    <ProgramInstanceRow key={inst.id} inst={inst} userId={userId} />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProgramInstanceRow({
  inst,
  userId,
}: {
  inst: TreatmentProgramInstanceSummary;
  userId: string;
}) {
  const href = `/app/doctor/patients/${encodeURIComponent(userId)}/programs/${encodeURIComponent(inst.id)}`;
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{inst.title}</p>
        <p className="text-xs text-muted-foreground">
          {inst.createdAt.slice(0, 10).replace(/-/g, ".")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            statusClass(inst.status),
          )}
        >
          {statusLabel(inst.status)}
        </span>
        <Link
          href={href}
          className="text-xs text-primary underline-offset-4 hover:underline"
        >
          Открыть
        </Link>
      </div>
    </li>
  );
}
