import Link from "next/link";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeCardClass } from "./patientHomeCardStyles";

type Props = {
  /** Полный tier patient — без CTA активации. */
  personalTierOk: boolean;
};

export function PatientHomeBookingCard({ personalTierOk }: Props) {
  return (
    <section aria-labelledby="patient-home-booking-heading">
      <h2 id="patient-home-booking-heading" className="mb-2 text-base font-semibold">
        Запись на приём
      </h2>
      <div className={`${patientHomeCardClass} flex flex-col gap-3`}>
        <p className="text-sm text-muted-foreground">
          Запишитесь на приём или откройте кабинет с вашими визитами.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={routePaths.patientBooking}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Записаться
          </Link>
          <Link
            href={routePaths.cabinet}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted/50"
          >
            Мои записи
          </Link>
        </div>
        {!personalTierOk ?
          <p className="text-xs text-muted-foreground">
            <Link href={`${routePaths.bindPhone}?next=${encodeURIComponent(routePaths.patient)}`} className="font-medium text-primary underline-offset-4 hover:underline">
              Активировать профиль
            </Link>
            {" — чтобы пользоваться записями и персональными разделами."}
          </p>
        : null}
      </div>
    </section>
  );
}
