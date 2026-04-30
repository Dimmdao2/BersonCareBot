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
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
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
      <p className="line-clamp-1 text-[11px] lg:text-xs">
        Запись откроется после входа
        <Link href={appLoginWithNextHref(routePaths.patient)} className="sr-only">
          Войти
        </Link>
      </p>
    : !personalTierOk ?
      <p className="line-clamp-2">
        <Link href={`${routePaths.bindPhone}?next=${encodeURIComponent(routePaths.patient)}`} className={patientButtonGhostLinkClass}>
          Активировать профиль
        </Link>
      </p>
    : (
      <span className="invisible select-none" aria-hidden>
        .
      </span>
    );

  return (
    <section aria-labelledby="patient-home-booking-heading" className="h-full">
      <article
        id="patient-home-booking-card"
        className={cn(patientHomeCardSuccessClass, patientHomeBookingCardGeometryClass)}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-stretch gap-3 min-[380px]:flex-row min-[380px]:items-start lg:flex-col lg:items-stretch lg:gap-5">
          <div className="flex min-h-0 min-w-0 flex-1 gap-3 lg:flex-col">
            <div
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#dcfce7] text-[var(--patient-color-success)] lg:size-14"
              aria-hidden
            >
              <PatientHomeSafeImage
                src={blockIconImageUrl}
                alt=""
                className="size-6 rounded-md object-cover lg:size-7"
                loading="lazy"
                fallback={<Calendar className="size-6" aria-hidden />}
              />
            </div>
            <div className="min-w-0 flex-1 lg:max-w-[18rem]">
              <h2 id="patient-home-booking-heading" className="text-base font-bold leading-5 text-[var(--patient-text-primary)] min-[380px]:text-lg lg:text-2xl lg:leading-7">
                Нужна консультация?
              </h2>
              <p className={patientHomeBookingCopyClampClass}>Запишитесь на приём к специалисту очно или онлайн.</p>
            </div>
          </div>
          <div className={patientHomeBookingActionsClass}>
            <Link href={bookingHref} prefetch={false} className={cn(patientButtonSuccessClass, "min-h-10 w-full min-w-0 rounded-xl px-3 text-sm lg:min-h-12 lg:text-base")}>
              Записаться
            </Link>
            <Link href={cabinetHref} prefetch={false} className={cn(patientButtonSecondaryClass, "min-h-9 w-full min-w-0 rounded-xl px-3 text-sm lg:min-h-11")}>
              Мои приёмы
            </Link>
          </div>
        </div>
        <div className={patientHomeBookingFooterSlotClass}>{footer}</div>
      </article>
    </section>
  );
}
