"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";

type Props = {
  bookings: PatientBookingRecord[];
};

function statusLabel(status: PatientBookingRecord["status"]): string {
  if (status === "cancelled") return "Отменена";
  if (status === "completed") return "Завершена";
  if (status === "rescheduled") return "Перенесена";
  if (status === "no_show") return "Неявка";
  if (status === "failed_sync") return "Ошибка";
  if (status === "creating") return "Создается";
  return "Подтверждена";
}

export function CabinetPastBookings({ bookings }: Props) {
  const [open, setOpen] = useState(false);

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
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока пусто.</p>
          ) : (
            bookings.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {new Date(row.slotStart).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{row.bookingType === "online" ? "Онлайн" : "Очный"} приём</p>
                </div>
                <Badge variant="outline">{statusLabel(row.status)}</Badge>
              </div>
            ))
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
