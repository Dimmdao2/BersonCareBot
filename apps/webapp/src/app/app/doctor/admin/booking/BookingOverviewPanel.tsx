import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BOOKING_ADMIN_BASE } from "@/app/app/doctor/admin/booking/bookingAdminTabs";
import type { BookingAdminOverviewData } from "@/app/app/doctor/admin/booking/loadBookingAdminOverview";
import { BOOKING_CARD_GRID_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export function BookingOverviewPanel({ data }: { data: BookingAdminOverviewData }) {
  if (data.unavailable) {
    return <p className="text-sm text-muted-foreground">Каноническая запись недоступна без подключения к БД.</p>;
  }

  const { stats, warnings } = data;

  return (
    <div className="space-y-4">
      <div className={BOOKING_CARD_GRID_CLASS}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {stats.bookingEnabled ? "Запись включена" : "Запись не готова"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Активных локаций: {stats.activeLocations}</p>
            <p>Активных услуг: {stats.activeServices}</p>
            <p>Доступно пациентам: {stats.patientVisibleServices}</p>
            <p>Расписание: {stats.hasCustomSchedule ? "настроено" : "не настроено"}</p>
            {stats.servicesWithoutAvailability > 0 ? (
              <p className="text-muted-foreground">
                Услуг без доступности: {stats.servicesWithoutAvailability}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Быстрые действия</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <Link href={`${BOOKING_ADMIN_BASE}/locations`} className="text-primary hover:underline">
              Добавить локацию
            </Link>
            <Link href={`${BOOKING_ADMIN_BASE}/services`} className="text-primary hover:underline">
              Добавить услугу
            </Link>
            <Link href={`${BOOKING_ADMIN_BASE}/schedule`} className="text-primary hover:underline">
              Настроить расписание
            </Link>
            <Link href={`${BOOKING_ADMIN_BASE}/schedule`} className="text-primary hover:underline">
              Проверить слоты
            </Link>
            {stats.bridgeEnabled ? (
              <Link href={`${BOOKING_ADMIN_BASE}/integrations`} className="text-primary hover:underline">
                Rubitime-маппинг
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {warnings.length > 0 ? (
        <Card className="border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">Внимание</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
