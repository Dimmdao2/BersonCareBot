"use client";

import { useState, type ReactNode } from "react";
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

/** В журнале прошлых приёмов не показываем нейтральное «подтверждена»; «отменена» — красным. */
function nativePastStatusRight(status: PatientBookingRecord["status"]): ReactNode {
  if (status === "confirmed") return null;
  if (status === "cancelled") {
    return <span className="shrink-0 text-sm font-medium text-destructive">Отменена</span>;
  }
  if (status === "completed") return <Badge variant="outline">Завершена</Badge>;
  if (status === "rescheduled") return <Badge variant="outline">Перенесена</Badge>;
  if (status === "no_show") return <Badge variant="outline">Неявка</Badge>;
  if (status === "failed_sync") return <Badge variant="destructive">Ошибка</Badge>;
  if (status === "cancel_failed") return <Badge variant="destructive">Не удалось отменить</Badge>;
  if (status === "cancelling") return <Badge variant="secondary">Отмена…</Badge>;
  if (status === "creating") return <Badge variant="secondary">Создается</Badge>;
  return null;
}

function projectionPastStatusRight(status: string): ReactNode {
  const s = status.toLowerCase();
  if (s === "cancelled") {
    return <span className="shrink-0 text-sm font-medium text-destructive">Отменена</span>;
  }
  if (s === "confirmed" || s === "created") return null;
  if (s === "rescheduled") return <Badge variant="outline">Перенесена</Badge>;
  return <Badge variant="outline">{status}</Badge>;
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
                  {nativePastStatusRight(row.booking.status)}
                </div>
              ) : (
                <div
                  key={`proj-${row.past.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.past.label}</p>
                    <p className="truncate text-xs text-muted-foreground">Запись из расписания</p>
                  </div>
                  {projectionPastStatusRight(row.past.status)}
                </div>
              ),
            )
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
