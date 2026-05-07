"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isSafeExternalHref } from "@/lib/url/isSafeExternalHref";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { formatBookingDateTimeMediumRu } from "@/shared/lib/formatBusinessDateTime";
import { openExternalLinkInMessenger } from "@/shared/lib/openExternalLinkInMessenger";
import { bookingProvenancePrefix, nativeBookingSubtitle } from "@/app/app/patient/cabinet/patientBookingLabels";
import { cn } from "@/lib/utils";
import {
  patientCardClass,
  patientInlineLinkClass,
  patientListItemClass,
  patientMutedTextClass,
} from "@/shared/ui/patientVisual";

type Props = {
  bookings: PatientBookingRecord[];
  /** IANA-таймзона отображения (`system_settings.app_display_timezone`). */
  appDisplayTimeZone: string;
};

function statusToBadgeVariant(status: PatientBookingRecord["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "cancelled" || status === "failed_sync" || status === "cancel_failed") return "destructive";
  if (status === "rescheduled" || status === "cancelling") return "secondary";
  return "outline";
}

function statusLabel(status: PatientBookingRecord["status"]): string {
  if (status === "creating") return "Создается";
  if (status === "confirmed") return "Подтверждена";
  if (status === "cancelled") return "Отменена";
  if (status === "cancelling") return "Отмена…";
  if (status === "cancel_failed") return "Не удалось отменить";
  if (status === "rescheduled") return "Перенесена";
  if (status === "completed") return "Завершена";
  if (status === "no_show") return "Неявка";
  return "Ошибка синхронизации";
}

function showManageLink(status: PatientBookingRecord["status"]): boolean {
  return (
    status === "confirmed" ||
    status === "rescheduled" ||
    status === "creating" ||
    status === "cancel_failed"
  );
}

export function BookingUpcomingSection({ bookings, appDisplayTimeZone }: Props) {
  if (bookings.length === 0) return null;

  return (
    <Card className={cn(patientCardClass, "ring-0")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Предстоящие записи</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {bookings.map((row) => {
          const rubitimeUrl = row.rubitimeManageUrl?.trim() ?? "";
          const safeRubitime = rubitimeUrl !== "" && isSafeExternalHref(rubitimeUrl);
          const canManage = safeRubitime && showManageLink(row.status);
          /** Отдельный URL «Информация» в модели пока нет — при совпадении с manage показываем только «Управлять». */

          const openRubitime = () => {
            if (safeRubitime && rubitimeUrl) openExternalLinkInMessenger(rubitimeUrl);
          };

          return (
            <div
              key={row.id}
              className={cn(
                patientListItemClass,
                "flex flex-col gap-2 !px-3 !py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {formatBookingDateTimeMediumRu(row.slotStart, appDisplayTimeZone)}
                </p>
                <p className={cn(patientMutedTextClass, "truncate text-xs")}>
                  {bookingProvenancePrefix(row)}
                  {nativeBookingSubtitle(row)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <Badge variant={statusToBadgeVariant(row.status)}>{statusLabel(row.status)}</Badge>
                {canManage ? (
                  <Button
                    type="button"
                    variant="link"
                    className={cn(patientInlineLinkClass, "h-auto min-h-0 px-0 py-0 text-sm font-medium")}
                    onClick={openRubitime}
                  >
                    Управлять
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
