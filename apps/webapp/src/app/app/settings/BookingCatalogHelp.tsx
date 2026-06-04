import Link from "next/link";
import { BOOKING_ADMIN_BASE } from "@/app/app/doctor/admin/booking/bookingAdminTabs";

/**
 * Краткий runbook для настройки записи (solo-specialist UX).
 */
export function BookingCatalogHelp() {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
      <h2 className="mb-2 font-semibold">Порядок настройки</h2>
      <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
        <li>
          <Link href="#section-locations" className="text-foreground font-medium hover:underline">
            Локации и услуги
          </Link>{" "}
          — места приёма и общий каталог услуг.
        </li>
        <li>
          <Link href="#section-availability" className="text-foreground font-medium hover:underline">
            Доступность
          </Link>{" "}
          — где какая услуга доступна.
        </li>
        <li>
          <Link href="/app/doctor/appointments?tab=schedule" className="text-foreground font-medium hover:underline">
            Расписание
          </Link>{" "}
          — рабочие дни и исключения по локациям.
        </li>
        <li>
          <Link href={`${BOOKING_ADMIN_BASE}/form-public`} className="text-foreground font-medium hover:underline">
            Публичная запись
          </Link>{" "}
          — ссылка для пациентов после настройки каталога.
        </li>
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        Связь с Rubitime — только на вкладке Rubitime, если включена интеграция.
      </p>
    </div>
  );
}
