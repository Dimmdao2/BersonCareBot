import Link from "next/link";
import { Calendar } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeCardSuccessClass } from "./patientHomeCardStyles";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { patientButtonSecondaryClass, patientButtonSuccessClass, patientButtonGhostLinkClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = {
  /** Полный tier patient — без CTA активации. */
  personalTierOk: boolean;
  anonymousGuest: boolean;
};

export function PatientHomeBookingCard({ personalTierOk, anonymousGuest }: Props) {
  const bookingHref = anonymousGuest ? appLoginWithNextHref(routePaths.patientBooking) : routePaths.patientBooking;
  const cabinetHref = anonymousGuest ? appLoginWithNextHref(routePaths.cabinet) : routePaths.cabinet;

  return (
    <section aria-labelledby="patient-home-booking-heading">
      <article
        id="patient-home-booking-card"
        className={cn(
          patientHomeCardSuccessClass,
          "flex min-h-[104px] flex-col gap-3 p-4 lg:min-h-[160px] lg:flex-row lg:items-center lg:gap-4 lg:p-6",
        )}
      >
        <div className="flex items-start gap-3 lg:items-center">
          <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#dcfce7] text-[var(--patient-color-success)] lg:size-14">
            <Calendar className="size-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="patient-home-booking-heading" className="text-lg font-bold text-[var(--patient-text-primary)] lg:text-xl">
              Запись на приём
            </h2>
            <p className="mt-1 text-sm leading-5 text-[var(--patient-text-secondary)]">
              {anonymousGuest ? "Войдите, чтобы выбрать время и услугу." : "Выберите удобное время и откройте кабинет с вашими визитами."}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end lg:w-auto lg:shrink-0">
          <Link href={bookingHref} prefetch={false} className={cn(patientButtonSuccessClass, "sm:min-w-[12rem]")}>
            {anonymousGuest ? "Войти, чтобы записаться" : "Записаться"}
          </Link>
          <Link href={cabinetHref} prefetch={false} className={cn(patientButtonSecondaryClass, "sm:min-w-[12rem]")}>
            {anonymousGuest ? "Войти к записям" : "Мои записи"}
          </Link>
        </div>
        {anonymousGuest ?
          <p className="text-xs leading-5 text-[var(--patient-text-secondary)]">
            <Link href={appLoginWithNextHref(routePaths.patient)} className={patientButtonGhostLinkClass}>
              Войти
            </Link>
            {" — чтобы пользоваться записями и персональными разделами."}
          </p>
        : !personalTierOk ?
          <p className="text-xs leading-5 text-[var(--patient-text-secondary)]">
            <Link href={`${routePaths.bindPhone}?next=${encodeURIComponent(routePaths.patient)}`} className="font-medium text-primary underline-offset-4 hover:underline">
              Активировать профиль
            </Link>
            {" — чтобы пользоваться записями и персональными разделами."}
          </p>
        : null}
      </article>
    </section>
  );
}
