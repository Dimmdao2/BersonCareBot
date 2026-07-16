import Link from "next/link";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import type { SessionUser } from "@/shared/types/session";
import type { PatientMaintenanceAppointment } from "@/modules/patient-booking/maintenanceHistory";
import { isSafeExternalHref } from "@/lib/url/isSafeExternalHref";
import { buttonVariants } from "@/shared/ui/patient/primitives/button-variants";
import { formatBookingDateTimeMediumRu } from "@/shared/lib/formatBusinessDateTime";
import { cn } from "@/lib/utils";
import {
  patientMutedTextClass,
  patientSurfaceNeutralClass,
  patientPrimaryActionClass,
} from "@/shared/ui/patient/patientVisual";

export type PatientMaintenanceScreenProps = {
  user: SessionUser | null;
  message: string;
  /** Already normalized; still validated at render for safety. */
  bookingUrl: string | null;
  bookings: PatientMaintenanceBooking[];
  appDisplayTimeZone: string;
};

export type PatientMaintenanceBooking = {
  id: string;
  startAt: string;
  status: string;
  subtitle: string;
};

const ACTIVE_UPCOMING_STATUSES = new Set([
  "created",
  "awaiting_payment",
  "paid",
  "confirmed",
  "rescheduled",
  "manual_review_required",
]);

export function selectMaintenanceUpcomingBookings(
  rows: PatientMaintenanceAppointment[],
  now: Date = new Date(),
): PatientMaintenanceBooking[] {
  const threshold = now.getTime();
  return rows
    .filter((row) => ACTIVE_UPCOMING_STATUSES.has(row.status) && Date.parse(row.startAt) >= threshold)
    .sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt))
    .map(({ id, startAt, status, subtitle }) => ({
      id,
      startAt,
      status,
      subtitle,
    }));
}

/**
 * Standalone server-friendly экран режима техработ: без primary patient nav / bottom nav.
 */
export function PatientMaintenanceScreen({
  user,
  message,
  bookingUrl,
  bookings,
  appDisplayTimeZone,
}: PatientMaintenanceScreenProps) {
  const safeExternal = bookingUrl && isSafeExternalHref(bookingUrl) ? bookingUrl : null;

  return (
    <PatientAppShell
     
      title="Приложение в разработке"
      user={user}
      patientHideBottomNav
      patientSuppressShellTitle
      patientHideRightIcons
    >
      <div className="flex flex-col gap-4 pb-4">
        <div className={cn(patientSurfaceNeutralClass, "flex flex-col gap-2")}>
          <h2 className="sr-only">Сообщение для пациента</h2>
          <p className="whitespace-pre-wrap text-sm text-[var(--patient-text-primary)]">{message}</p>
        </div>

        {safeExternal ? (
          <div className="flex flex-col gap-2">
            <Link
              href={safeExternal}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "default", size: "default" }), patientPrimaryActionClass, "w-full text-center")}
            >
              Записаться на приём
            </Link>
            <p className={cn(patientMutedTextClass, "text-center text-xs")}>
              Внешняя страница записи откроется в новой вкладке.
            </p>
          </div>
        ) : null}

        <section className="flex flex-col gap-2">
          <h3 className="text-base font-semibold text-[var(--patient-text-primary)]">Ближайшие записи</h3>
          {bookings.length === 0 ? (
            <p className={cn(patientMutedTextClass, "text-sm")}>Нет предстоящих записей.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {bookings.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    patientSurfaceNeutralClass,
                    "border border-[var(--patient-border)] !p-3 text-sm shadow-none",
                  )}
                >
                  <p className="font-medium text-[var(--patient-text-primary)]">
                    {formatBookingDateTimeMediumRu(row.startAt, appDisplayTimeZone)}
                  </p>
                  <p className={cn(patientMutedTextClass, "mt-1 truncate text-xs")}>
                    {row.subtitle}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PatientAppShell>
  );
}
