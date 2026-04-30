import Link from "next/link";
import { BookOpen } from "lucide-react";
import type { ResolvedCourseCard } from "@/modules/patient-home/patientHomeResolvers";
import {
  patientHomeCardClass,
  patientHomeCardCompactClass,
  patientHomeCardSubtitleClampXs3Class,
  patientHomeCardTitleClampSmClass,
  patientHomeCourseRowItemLayoutClass,
} from "./patientHomeCardStyles";
import { routePaths } from "@/app-layer/routes/paths";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { cn } from "@/lib/utils";

type Props = {
  cards: ResolvedCourseCard[];
  anonymousGuest?: boolean;
  personalTierOk?: boolean;
};

export function PatientHomeCoursesRow({
  cards,
  anonymousGuest = false,
  personalTierOk = true,
}: Props) {
  if (cards.length === 0) {
    const catalogHref = anonymousGuest ? appLoginWithNextHref(routePaths.patientCourses) : routePaths.patientCourses;
    const ctaLabel = anonymousGuest ? "Войти и смотреть курсы" : "К каталогу курсов";
    return (
      <section id="patient-home-courses-row" className="flex flex-col gap-2" aria-labelledby="patient-home-courses-heading">
        <h2 id="patient-home-courses-heading" className="text-base font-bold text-[var(--patient-text-primary)]">
          Курсы
        </h2>
        <article
          data-courses-empty
          className={cn(
            patientHomeCardClass,
            "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
          )}
        >
          <div className="flex min-w-0 flex-1 gap-3">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--patient-color-primary-soft)]/40 text-[var(--patient-color-primary)]"
              aria-hidden
            >
              <BookOpen className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn(patientHomeCardTitleClampSmClass, "font-semibold text-[var(--patient-text-primary)]")}>
                Пока нет курсов на главной
              </p>
              <p className={cn(patientHomeCardSubtitleClampXs3Class, "mt-1 text-[var(--patient-text-secondary)]")}>
                {anonymousGuest ?
                  "Войдите, чтобы видеть доступные вам курсы и материалы."
                : !personalTierOk ?
                  "Каталог курсов станет доступен после активации профиля."
                : "Когда появятся материалы, они появятся в этом списке."}
              </p>
            </div>
          </div>
          <Link
            href={catalogHref}
            prefetch={false}
            className={cn(
              patientHomeCardCompactClass,
              "inline-flex w-full shrink-0 items-center justify-center text-center text-sm font-semibold text-[var(--patient-color-primary)] sm:w-auto sm:min-w-[10rem]",
            )}
          >
            {ctaLabel}
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section id="patient-home-courses-row" className="flex flex-col gap-2" aria-labelledby="patient-home-courses-heading">
      <h2 id="patient-home-courses-heading" className="text-base font-bold text-[var(--patient-text-primary)]">
        Курсы
      </h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {cards.map((c) => (
          <li key={c.itemId}>
            <Link
              href={c.href}
              prefetch={false}
              className={cn(
                patientHomeCardCompactClass,
                patientHomeCourseRowItemLayoutClass,
                "transition-opacity hover:opacity-95 active:scale-[0.99]",
              )}
            >
              <span className={patientHomeCardTitleClampSmClass}>{c.title}</span>
              {c.subtitle?.trim() ?
                <span className={cn(patientHomeCardSubtitleClampXs3Class, "mt-1")}>{c.subtitle.trim()}</span>
              : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
