import Link from "next/link";
import { Calendar, Zap } from "lucide-react";
import type { ResolvedSosCard } from "@/modules/patient-home/patientHomeResolvers";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeSosSubtitleClampClass } from "./patientHomeCardStyles";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import {
  patientButtonDangerOutlineClass,
  patientButtonGhostLinkClass,
  patientButtonSuccessClass,
} from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

const splitHeadingClass =
  "font-sans text-sm font-medium leading-snug tracking-tight text-[var(--patient-block-heading)]";

const dangerHalfBgClass = "bg-[var(--patient-color-danger-soft)]";
const successHalfBgClass = "bg-[var(--patient-color-success-soft)]";

const outerChromeClass = cn(
  "overflow-hidden rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "border border-[var(--patient-border)] shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

const sosIconShellClass =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--patient-color-danger)] text-white lg:size-10";
const bookingIconShellClass =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#dcfce7] text-[var(--patient-color-success)] lg:size-10";

const sosButtonClass = cn(
  patientButtonDangerOutlineClass,
  "!min-h-8 shrink-0 px-2.5 py-1.5 text-xs font-semibold text-[#8a3a3a]",
  "border-[#d8a3a3] hover:bg-[#fff1f1]/80 active:bg-[#fee7e7]/80",
);

const bookingButtonClass = cn(patientButtonSuccessClass, "!min-h-8 px-3 py-1.5 text-xs font-semibold sm:!min-h-8");

type Props = {
  sos: ResolvedSosCard | null;
  showSosHalf: boolean;
  showBookingHalf: boolean;
  personalTierOk: boolean;
  anonymousGuest: boolean;
  sosIconUrl?: string | null;
  bookingIconUrl?: string | null;
};

export function PatientHomeSosBookingSplitCard({
  sos,
  showSosHalf,
  showBookingHalf,
  personalTierOk,
  anonymousGuest,
  sosIconUrl,
  bookingIconUrl,
}: Props) {
  const bookingHref = anonymousGuest ? appLoginWithNextHref(routePaths.patientBooking) : routePaths.patientBooking;

  const sosCopy = "Рекомендации по облегчению боли";

  const bookingFooter =
    anonymousGuest ?
      <p className="text-[10px] leading-tight text-[var(--patient-block-caption)]">
        Запись откроется после входа
        <Link href={appLoginWithNextHref(routePaths.patient)} className="sr-only">
          Войти
        </Link>
      </p>
    : !personalTierOk ?
      <p className="min-w-0 text-[10px] leading-tight">
        <Link href={`${routePaths.bindPhone}?next=${encodeURIComponent(routePaths.patient)}`} className={patientButtonGhostLinkClass}>
          Активировать профиль
        </Link>
      </p>
    : null;

  const renderSosHalf = () => {
    if (!showSosHalf || !sos) return null;
    return (
      <section
        aria-labelledby="patient-home-sos-heading"
        className={cn(
          "flex min-h-[88px] min-w-0 flex-1 flex-col justify-between gap-2 p-3 lg:min-h-[120px] lg:gap-2 lg:p-[14px]",
          dangerHalfBgClass,
        )}
      >
        <div className="flex min-w-0 items-start gap-2">
          <div className={sosIconShellClass} aria-hidden>
            <PatientHomeSafeImage
              src={sosIconUrl}
              alt=""
              className="size-6 rounded-full object-cover lg:size-[26px]"
              loading="lazy"
              fallback={<Zap className="size-[22px] lg:size-6" aria-hidden />}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="patient-home-sos-heading" className={cn(splitHeadingClass, "line-clamp-2")}>
              Если болит сейчас
            </h3>
            <p className={cn(patientHomeSosSubtitleClampClass, "mt-0.5 text-xs leading-snug")}>{sosCopy}</p>
          </div>
        </div>
        <Link href={sos.href} prefetch={false} className={cn(sosButtonClass, "w-full")}>
          Посмотреть
        </Link>
      </section>
    );
  };

  const renderBookingHalf = () => {
    if (!showBookingHalf) return null;
    return (
      <section
        aria-labelledby="patient-home-booking-heading"
        className={cn(
          "flex min-h-[88px] min-w-0 flex-1 flex-col justify-between gap-2 p-3 lg:min-h-[120px] lg:gap-2 lg:p-[14px]",
          successHalfBgClass,
        )}
      >
        <div className="flex min-w-0 items-start gap-2">
          <div className={bookingIconShellClass} aria-hidden>
            <PatientHomeSafeImage
              src={bookingIconUrl}
              alt=""
              className="size-6 rounded-full object-cover lg:size-[26px]"
              loading="lazy"
              fallback={<Calendar className="size-[22px] lg:size-6" aria-hidden />}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="patient-home-booking-heading" className={cn(splitHeadingClass, "pt-0.5")}>
              Записаться
            </h3>
            <p className={cn(patientHomeSosSubtitleClampClass, "mt-0.5 text-xs leading-snug")}>Очно или онлайн</p>
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-1.5">
          <Link href={bookingHref} prefetch={false} className={cn(bookingButtonClass, "w-full")}>
            Записаться
          </Link>
          {bookingFooter}
        </div>
      </section>
    );
  };

  const sosReady = showSosHalf && sos !== null;
  const bookingReady = showBookingHalf;

  if (!sosReady && !bookingReady) return null;

  if (sosReady && bookingReady) {
    return (
      <article id="patient-home-sos-booking-split-card" className={outerChromeClass}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-row items-stretch">
          {renderSosHalf()}
          <div className="w-px shrink-0 self-stretch bg-[#ccc]" aria-hidden />
          {renderBookingHalf()}
        </div>
      </article>
    );
  }

  if (sosReady) {
    return (
      <article id="patient-home-sos-booking-split-card" className={outerChromeClass}>
        {renderSosHalf()}
      </article>
    );
  }

  return (
    <article id="patient-home-sos-booking-split-card" className={outerChromeClass}>
      {renderBookingHalf()}
    </article>
  );
}
