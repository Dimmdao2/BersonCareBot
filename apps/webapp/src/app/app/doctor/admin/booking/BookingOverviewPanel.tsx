import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import type { BookingAdminOverviewData } from "@/app/app/doctor/admin/booking/loadBookingAdminOverview";
import { BOOKING_CARD_GRID_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";

export function BookingOverviewPanel({ data }: { data: BookingAdminOverviewData }) {
  if (data.unavailable) {
    return <p className="text-sm text-muted-foreground">Запись недоступна без подключения к базе данных.</p>;
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
            <p>Расписание:{" "}
              {stats.hasUpcomingSchedule
                ? "на ближайшие дни"
                : stats.hasCustomSchedule
                  ? "настроено"
                  : "не настроено"}
            </p>
            {stats.servicesWithoutAvailability > 0 ? (
              <p className="text-muted-foreground">
                Услуг без доступности: {stats.servicesWithoutAvailability}
              </p>
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
