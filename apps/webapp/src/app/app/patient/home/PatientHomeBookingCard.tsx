import Link from "next/link";
import { Calendar } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeCardSuccessClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { patientButtonSecondaryClass, patientButtonSuccessClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type PatientHomeBookingCardProps = {
  bookingHref: string;
  cabinetHref: string;
  /** Нет сессии — ведём на вход с возвратом на главную пациента. */
  guestMode: boolean;
};

const loginWithNext = `/app?next=${encodeURIComponent(routePaths.patient)}`;

/**
 * Карточка записи: success tone, CTA записи и вторичный переход в приёмы.
 */
export function PatientHomeBookingCard({ bookingHref, cabinetHref, guestMode }: PatientHomeBookingCardProps) {
  const primaryHref = guestMode ? loginWithNext : bookingHref;
  const secondaryHref = guestMode ? loginWithNext : cabinetHref;

  return (
    <article
      id="patient-home-booking-card"
      className={cn(patientHomeCardSuccessClass, "flex min-h-[104px] flex-col gap-3 p-4 lg:min-h-[160px] lg:flex-row lg:items-center lg:gap-4 lg:p-6")}
    >
      <div className="flex items-start gap-3 lg:items-center">
        <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#dcfce7] text-[var(--patient-color-success)] lg:size-14">
          <Calendar className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-[var(--patient-text-primary)] lg:text-xl">Запись на приём</h2>
          <p className="mt-1 text-sm text-[var(--patient-text-secondary)]">
            {guestMode ? "Войдите, чтобы выбрать время и услугу." : "Выберите удобное время и оставьте контакты."}
          </p>
        </div>
      </div>
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end lg:w-auto lg:shrink-0">
        <Link href={primaryHref} prefetch={false} className={cn(patientButtonSuccessClass, "sm:min-w-[12rem]")}>
          {guestMode ? "Войти, чтобы записаться" : "Записаться"}
        </Link>
        <Link href={secondaryHref} prefetch={false} className={cn(patientButtonSecondaryClass, "sm:min-w-[12rem]")}>
          Мои приёмы
        </Link>
      </div>
    </article>
  );
}
