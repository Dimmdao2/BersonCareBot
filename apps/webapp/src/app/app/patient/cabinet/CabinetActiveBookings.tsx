import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { nativeBookingSubtitle } from "./patientBookingLabels";

type Props = {
  bookings: PatientBookingRecord[];
  /** Публичная ссылка на бота/поддержку (`system_settings.support_contact_url`). */
  manageBookingHref: string;
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

export function CabinetActiveBookings({ bookings, manageBookingHref }: Props) {
  if (bookings.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Активные записи</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">У вас пока нет активных записей.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Активные записи</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {bookings.map((row) => (
          <div
            key={row.id}
            className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {new Date(row.slotStart).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <p className="truncate text-xs text-muted-foreground">{nativeBookingSubtitle(row)}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Badge variant={statusToBadgeVariant(row.status)}>{statusLabel(row.status)}</Badge>
              {showManageLink(row.status) ? (
                <Link
                  href={manageBookingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Изменить
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
