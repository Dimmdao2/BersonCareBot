"use client";

import { Badge } from "@/components/ui/badge";
import { isSafeExternalHref } from "@/lib/url/isSafeExternalHref";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { formatBookingDateTimeMediumRu } from "@/shared/lib/formatBusinessDateTime";
import { openExternalLinkInMessenger } from "@/shared/lib/openExternalLinkInMessenger";
import { bookingProvenancePrefix, nativeBookingSubtitle } from "@/app/app/patient/cabinet/patientBookingLabels";
import { cn } from "@/lib/utils";
import { patientListItemClass, patientMutedTextClass, patientSectionTitleClass } from "@/shared/ui/patientVisual";

/** Тон карточки «Следующее напоминание» на главной — без фиксированной высоты (список записей). */
const bookingReminderSectionSurfaceClass = cn(
  "flex flex-col gap-3 overflow-hidden rounded-[var(--patient-card-radius-mobile)] border border-[#fde68a]",
  "bg-[linear-gradient(135deg,#fffaf0_0%,#fff7df_100%)]",
  "p-4 lg:rounded-[var(--patient-card-radius-desktop)] lg:p-5",
);

/** CTA как у напоминания на главной (`PatientHomeNextReminderCard` — `reminderCtaBaseClass`). */
const bookingReminderManageCtaClass = cn(
  "inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 text-[13px] font-bold text-[#d97706] transition-colors sm:text-sm",
  "hover:bg-[#fef3c7]/80 active:bg-[#fef3c7]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f59e0b]",
);

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
    <div className={bookingReminderSectionSurfaceClass}>
      <h3 className={patientSectionTitleClass}>Предстоящие записи</h3>
      <div className="flex flex-col gap-2">
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
                  <button type="button" className={bookingReminderManageCtaClass} onClick={openRubitime}>
                    Управлять
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
