import Link from "next/link";
import { Calendar } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import {
  patientHomeBookingActionsClass,
  patientHomeBookingCardGeometryClass,
  patientHomeBookingCopyClampClass,
  patientHomeBookingFooterSlotClass,
  patientHomeCardSuccessClass,
} from "./patientHomeCardStyles";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { patientButtonSecondaryClass, patientButtonSuccessClass, patientButtonGhostLinkClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = {
  /** Полный tier patient — без CTA активации. */
  personalTierOk: boolean;
  anonymousGuest: boolean;
  /** CMS media URL for card leading icon; Lucide fallback when null/empty. */
  blockIconImageUrl?: string | null;
};

export function PatientHomeBookingCard({ personalTierOk, anonymousGuest, blockIconImageUrl }: Props) {
  const bookingHref = anonymousGuest ? appLoginWithNextHref(routePaths.patientBooking) : routePaths.patientBooking;
  const cabinetHref = anonymousGuest ? appLoginWithNextHref(routePaths.cabinet) : routePaths.cabinet;

  const footer =
    anonymousGuest ?
      <p className="line-clamp-2">
        <Link href={appLoginWithNextHref(routePaths.patient)} className={patientButtonGhostLinkClass}>
          Войти
        </Link>
        {" — чтобы пользоваться записями и персональными разделами."}
      </p>
    : !personalTierOk ?
      <p className="line-clamp-2">
        <Link href={`${routePaths.bindPhone}?next=${encodeURIComponent(routePaths.patient)}`} className="font-medium text-primary underline-offset-4 hover:underline">
          Активировать профиль
        </Link>
        {" — чтобы пользоваться записями и персональными разделами."}
      </p>
    : (
      <span className="invisible select-none" aria-hidden>
        .
      </span>
    );

  return (
    <section aria-labelledby="patient-home-booking-heading">
      <article
        id="patient-home-booking-card"
        className={cn(patientHomeCardSuccessClass, patientHomeBookingCardGeometryClass)}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-5">
          <div className="flex min-h-0 min-w-0 flex-1 gap-3">
            <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#dcfce7] text-[var(--patient-color-success)] lg:size-14">
              {blockIconImageUrl?.trim() ?
                // eslint-disable-next-line @next/next/no-img-element -- CMS URL, decorative
                <img
                  src={blockIconImageUrl.trim()}
                  alt=""
                  className="size-6 rounded-md object-cover lg:size-7"
                  loading="lazy"
                />
              : <Calendar className="size-6" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="patient-home-booking-heading" className="text-lg font-bold text-[var(--patient-text-primary)] lg:text-xl">
                Запись на приём
              </h2>
              <p className={patientHomeBookingCopyClampClass}>
                {anonymousGuest ? "Войдите, чтобы выбрать время и услугу." : "Выберите удобное время и откройте кабинет с вашими визитами."}
              </p>
            </div>
          </div>
          <div className={patientHomeBookingActionsClass}>
            <Link href={bookingHref} prefetch={false} className={cn(patientButtonSuccessClass, "w-full min-w-0 lg:w-full")}>
              {anonymousGuest ? "Войти, чтобы записаться" : "Записаться"}
            </Link>
            <Link href={cabinetHref} prefetch={false} className={cn(patientButtonSecondaryClass, "w-full min-w-0 lg:w-full")}>
              {anonymousGuest ? "Войти к записям" : "Мои записи"}
            </Link>
          </div>
        </div>
        <div className={patientHomeBookingFooterSlotClass}>{footer}</div>
      </article>
    </section>
  );
}
