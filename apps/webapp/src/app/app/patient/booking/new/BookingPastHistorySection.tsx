"use client";

import { type ReactNode } from "react";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { formatBookingDateTimeMediumRu } from "@/shared/lib/formatBusinessDateTime";
import { patientListItemClass, patientMutedTextClass, patientSectionSurfaceClass, patientSectionTitleClass } from "@/shared/ui/patientVisual";
import type { CabinetPastRow } from "@/app/app/patient/cabinet/cabinetPastBookingsMerge";
import { bookingProvenancePrefix, nativeBookingSubtitle } from "@/app/app/patient/cabinet/patientBookingLabels";

type Props = {
  items: CabinetPastRow[];
  appDisplayTimeZone: string;
};

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

function PastList({ items, appDisplayTimeZone }: Props) {
  if (items.length === 0) {
    return <p className={patientMutedTextClass}>Пока пусто.</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((row) =>
        row.kind === "native" ? (
          <li
            key={`native-${row.booking.id}`}
            className={cn(patientListItemClass, "flex items-center justify-between gap-2 !px-3 !py-2")}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {formatBookingDateTimeMediumRu(row.booking.slotStart, appDisplayTimeZone)}
              </p>
              <p className={cn(patientMutedTextClass, "truncate text-xs")}>
                {bookingProvenancePrefix(row.booking)}
                {nativeBookingSubtitle(row.booking)}
              </p>
            </div>
            {nativePastStatusRight(row.booking.status)}
          </li>
        ) : (
          <li
            key={`proj-${row.past.id}`}
            className={cn(patientListItemClass, "flex items-center justify-between gap-2 !px-3 !py-2")}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.past.label}</p>
              <p className={cn(patientMutedTextClass, "truncate text-xs")}>Запись из расписания</p>
            </div>
            {projectionPastStatusRight(row.past.status)}
          </li>
        )
      )}
    </ul>
  );
}

export function BookingPastHistorySection({ items, appDisplayTimeZone }: Props) {
  return (
    <div className={patientSectionSurfaceClass}>
      <div className="flex min-w-0 items-center gap-3">
        <History className="size-5 shrink-0 text-[var(--patient-color-primary)]" aria-hidden />
        <h3 className={cn(patientSectionTitleClass, "min-w-0")}>История посещений</h3>
      </div>
      <Dialog>
        <DialogTrigger render={<Button type="button" variant="outline" className="w-full" />}>
          Открыть историю
        </DialogTrigger>
        <DialogContent className="flex max-h-[min(80vh,560px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-4 py-3 text-left">
            <DialogTitle>История посещений</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
            <PastList items={items} appDisplayTimeZone={appDisplayTimeZone} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
