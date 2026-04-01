"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import type { CabinetPastRow } from "./cabinetPastBookingsMerge";
import { nativeBookingSubtitle } from "./patientBookingLabels";

type Props = {
  items: CabinetPastRow[];
};

function statusLabel(status: PatientBookingRecord["status"]): string {
  if (status === "cancelled") return "Отменена";
  if (status === "completed") return "Завершена";
  if (status === "rescheduled") return "Перенесена";
  if (status === "no_show") return "Неявка";
  if (status === "failed_sync") return "Ошибка";
  if (status === "cancel_failed") return "Не удалось отменить";
  if (status === "cancelling") return "Отмена…";
  if (status === "creating") return "Создается";
  return "Подтверждена";
}

function projectionStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "cancelled") return "Отменена";
  if (s === "confirmed" || s === "created") return "Подтверждена";
  if (s === "rescheduled") return "Перенесена";
  return status;
}

export function CabinetPastBookings({ items }: Props) {
  const [open, setOpen] = useState(() => items.length > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={open}
        >
          <CardTitle className="text-base">Журнал прошедших приёмов</CardTitle>
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </CardHeader>
      {open ? (
        <CardContent className="flex flex-col gap-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока пусто.</p>
          ) : (
            items.map((row) =>
              row.kind === "native" ? (
                <div
                  key={`native-${row.booking.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {new Date(row.booking.slotStart).toLocaleString("ru-RU", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{nativeBookingSubtitle(row.booking)}</p>
                  </div>
                  <Badge variant="outline">{statusLabel(row.booking.status)}</Badge>
                </div>
              ) : (
                <div
                  key={`proj-${row.past.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.past.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.past.link ? (
                        <Link href={row.past.link} className="text-primary underline-offset-4 hover:underline">
                          Открыть в расписании
                        </Link>
                      ) : (
                        "Запись из расписания"
                      )}
                    </p>
                  </div>
                  <Badge variant="outline">{projectionStatusLabel(row.past.status)}</Badge>
                </div>
              ),
            )
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
