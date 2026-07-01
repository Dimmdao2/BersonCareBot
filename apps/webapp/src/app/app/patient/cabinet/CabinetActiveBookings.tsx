"use client";

import { Badge } from "@/shared/ui/patient/primitives/badge";
import { Button } from "@/shared/ui/patient/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/patient/primitives/card";
import { isSafeExternalHref } from "@/lib/url/isSafeExternalHref";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { formatBookingDateTimeMediumRu } from "@/shared/lib/formatBusinessDateTime";
import { openExternalLinkInMessenger } from "@/shared/lib/openExternalLinkInMessenger";
import { bookingProvenancePrefix, nativeBookingSubtitle } from "./patientBookingLabels";
import { CabinetBookingActions } from "./CabinetBookingActions";
import { cn } from "@/lib/utils";
import { patientCardClass, patientInlineLinkClass, patientListItemClass, patientMutedTextClass } from "@/shared/ui/patient/patientVisual";

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
  return status === "confirmed" || status === "rescheduled" || status === "creating";
}

/** Format ISO datetime to iCalendar / Google Calendar compact form: `YYYYMMDDTHHmmssZ` */
function fmtCalDate(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function googleCalendarUrl(booking: PatientBookingRecord): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: booking.serviceTitleSnapshot ?? "Запись",
    dates: `${fmtCalDate(booking.slotStart)}/${fmtCalDate(booking.slotEnd)}`,
    ...(booking.branchTitleSnapshot ? { location: booking.branchTitleSnapshot } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function generateIcs(booking: PatientBookingRecord): string {
  const uid = `bersoncare-booking-${booking.id}@bersoncare`;
  const title = booking.serviceTitleSnapshot ?? "Запись";
  const location = booking.branchTitleSnapshot ?? "";
  const dtstart = fmtCalDate(booking.slotStart);
  const dtend = fmtCalDate(booking.slotEnd);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BersonCare//BersonCare//RU",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${title}`,
    location ? `LOCATION:${location}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function downloadIcs(booking: PatientBookingRecord): void {
  const content = generateIcs(booking);
  const blob = new Blob([content], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `booking-${booking.id}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function CabinetActiveBookings({ bookings, appDisplayTimeZone }: Props) {
  if (bookings.length === 0) {
    return (
      <Card className={cn(patientCardClass, "ring-0")}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Активные записи</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={patientMutedTextClass}>У вас пока нет активных записей.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(patientCardClass, "ring-0")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Активные записи</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {bookings.map((row) => {
          const manageHref = row.rubitimeManageUrl;
          const canEdit =
            manageHref !== null &&
            manageHref !== "" &&
            showManageLink(row.status) &&
            isSafeExternalHref(manageHref);
          return (
            <div
              key={row.id}
              className={cn(
                patientListItemClass,
                "flex flex-col gap-2 !px-3 !py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3",
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
                {row.canonicalAppointmentId ? <CabinetBookingActions row={row} /> : null}
                {canEdit && manageHref ? (
                  <Button
                    type="button"
                    variant="link"
                    className={cn(patientInlineLinkClass, "h-auto min-h-0 px-0 py-0 text-sm font-medium")}
                    onClick={() => {
                      openExternalLinkInMessenger(manageHref);
                    }}
                  >
                    Изменить
                  </Button>
                ) : null}
                {showManageLink(row.status) ? (
                  <>
                    <a
                      href={isSafeExternalHref(googleCalendarUrl(row)) ? googleCalendarUrl(row) : "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(patientInlineLinkClass, "text-xs")}
                    >
                      Google Календарь
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto min-h-0 px-1 py-0 text-xs"
                      onClick={() => downloadIcs(row)}
                    >
                      .ics
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
