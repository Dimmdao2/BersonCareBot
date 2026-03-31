import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { BookingCardActions } from "./BookingCardActions";

type Props = {
  bookings: PatientBookingRecord[];
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

function bookingTypeLabel(row: PatientBookingRecord): string {
  if (row.bookingType === "online") {
    if (row.category === "rehab_lfk") return "Онлайн - Реабилитация (ЛФК)";
    if (row.category === "nutrition") return "Онлайн - Нутрициология";
    return "Онлайн консультация";
  }
  return `Очный приём${row.city ? ` - ${row.city === "moscow" ? "Москва" : row.city === "spb" ? "СПб" : row.city}` : ""}`;
}

export function CabinetActiveBookings({ bookings }: Props) {
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
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">Активные записи</h2>
      {bookings.map((row) => (
        <Card key={row.id}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base">
                {new Date(row.slotStart).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
              </CardTitle>
              <Badge variant={statusToBadgeVariant(row.status)}>{statusLabel(row.status)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{bookingTypeLabel(row)}</p>
            {(row.status === "confirmed" ||
              row.status === "rescheduled" ||
              row.status === "creating" ||
              row.status === "cancel_failed") ? (
              <BookingCardActions booking={row} />
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
