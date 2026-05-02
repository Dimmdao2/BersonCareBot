import Link from "next/link";
import { AppShell } from "@/shared/ui/AppShell";
import type { SessionUser } from "@/shared/types/session";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { isSafeExternalHref } from "@/lib/url/isSafeExternalHref";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatBookingDateTimeMediumRu } from "@/shared/lib/formatBusinessDateTime";
import { bookingProvenancePrefix, nativeBookingSubtitle } from "@/app/app/patient/cabinet/patientBookingLabels";
import { cn } from "@/lib/utils";
import {
  patientMutedTextClass,
  patientSurfaceNeutralClass,
  patientPrimaryActionClass,
} from "@/shared/ui/patientVisual";
import { DEFAULT_PATIENT_BOOKING_URL } from "@/modules/system-settings/patientMaintenance";

export type PatientMaintenanceScreenProps = {
  user: SessionUser | null;
  message: string;
  /** Already normalized; still validated at render for safety. */
  bookingUrl: string;
  bookings: PatientBookingRecord[];
  appDisplayTimeZone: string;
};

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
  const hrefCandidate = bookingUrl.trim() || DEFAULT_PATIENT_BOOKING_URL;
  const safeExternal = isSafeExternalHref(hrefCandidate) ? hrefCandidate : DEFAULT_PATIENT_BOOKING_URL;

  return (
    <AppShell
      variant="patient"
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
                    {formatBookingDateTimeMediumRu(row.slotStart, appDisplayTimeZone)}
                  </p>
                  <p className={cn(patientMutedTextClass, "mt-1 truncate text-xs")}>
                    {bookingProvenancePrefix(row)}
                    {nativeBookingSubtitle(row)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
