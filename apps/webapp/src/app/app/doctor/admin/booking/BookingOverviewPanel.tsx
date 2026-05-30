import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BOOKING_ADMIN_BASE } from "@/app/app/doctor/admin/booking/bookingAdminTabs";
import type { BookingAdminOverviewData } from "@/app/app/doctor/admin/booking/loadBookingAdminOverview";
import { BOOKING_CARD_GRID_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
import { cn } from "@/lib/utils";

const READ_LABEL = { rubitime_legacy: "Rubitime", canonical: "Канон", rubitime: "Rubitime" } as const;

export function BookingOverviewPanel({ data }: { data: BookingAdminOverviewData }) {
  if (data.unavailable) {
    return <p className="text-sm text-muted-foreground">Каноническая запись недоступна без подключения к БД.</p>;
  }

  const { readiness, mode, warnings, mapping } = data;

  return (
    <div className="space-y-4">
      <div className={BOOKING_CARD_GRID_CLASS}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Готовность {readiness.done}/{readiness.total}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {readiness.items.map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                      item.ok ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {item.ok ? "✓" : "·"}
                  </span>
                  <span className={item.ok ? undefined : "text-muted-foreground"}>{item.label}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Текущий режим</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              Записи врача:{" "}
              <span className="font-medium">{READ_LABEL[mode.doctorAppointmentsReadSource]}</span>
            </p>
            <p>
              Слоты пациента: <span className="font-medium">{READ_LABEL[mode.bookingSlotsReadSource]}</span>
            </p>
            <p>
              Календарь: <span className="font-medium">{READ_LABEL[mode.calendarReadSource]}</span>
            </p>
            <p>
              Rubitime-мост: <span className="font-medium">{mode.bridgeEnabled ? "вкл." : "выкл."}</span>
            </p>
            <p className="pt-2 text-xs text-muted-foreground">
              маппинг: филиалы {mapping.branches}, специалисты {mapping.specialists}, услуги {mapping.services},
              доступность {mapping.availabilities}, записи {mapping.appointments}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Быстрые ссылки</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <Link href={`${BOOKING_ADMIN_BASE}/catalog`} className="text-primary hover:underline">
              Каталог
            </Link>
            <Link href={`${BOOKING_ADMIN_BASE}/availability`} className="text-primary hover:underline">
              Доступность
            </Link>
            <Link href={`${BOOKING_ADMIN_BASE}/public`} className="text-primary hover:underline">
              Публичная запись
            </Link>
            <Link href={`${BOOKING_ADMIN_BASE}/integrations`} className="text-primary hover:underline">
              Интеграции
            </Link>
          </CardContent>
        </Card>
      </div>

      {warnings.length > 0 ? (
        <Card className="border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">Предупреждения</CardTitle>
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
