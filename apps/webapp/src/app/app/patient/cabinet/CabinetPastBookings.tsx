"use client";

import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { formatBookingDateTimeMediumRu } from "@/shared/lib/formatBusinessDateTime";
import { patientCardClass, patientListItemClass, patientMutedTextClass } from "@/shared/ui/patientVisual";
import type { CabinetPastRow } from "./cabinetPastBookingsMerge";
import { bookingProvenancePrefix, nativeBookingSubtitle } from "./patientBookingLabels";

type Props = {
  items: CabinetPastRow[];
  /** IANA-таймзона отображения (`system_settings.app_display_timezone`). */
  appDisplayTimeZone: string;
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

export function CabinetPastBookings({ items, appDisplayTimeZone }: Props) {
  return (
    <Card className={cn(patientCardClass, "ring-0")}>
      <Collapsible defaultOpen={items.length > 0}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 text-left">
            <CardTitle className="text-base">Журнал прошедших приёмов</CardTitle>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-[var(--patient-text-muted)] transition-transform",
                "group-data-[panel-open]:rotate-180"
              )}
            />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-2">
            {items.length === 0 ? (
              <p className={patientMutedTextClass}>Пока пусто.</p>
            ) : (
              items.map((row) =>
                row.kind === "native" ? (
                  <div
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
                  </div>
                ) : (
                  <div
                    key={`proj-${row.past.id}`}
                    className={cn(patientListItemClass, "flex items-center justify-between gap-2 !px-3 !py-2")}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.past.label}</p>
                      <p className={cn(patientMutedTextClass, "truncate text-xs")}>Запись из расписания</p>
                    </div>
                    {projectionPastStatusRight(row.past.status)}
                  </div>
                ),
              )
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
