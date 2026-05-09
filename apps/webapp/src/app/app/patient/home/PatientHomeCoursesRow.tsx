import Link from "next/link";
import type { ResolvedCourseCard } from "@/modules/patient-home/patientHomeResolvers";
import {
  patientHomeBlockHeadingClass,
  patientHomeCardCompactClass,
  patientHomeCardSubtitleClampXs3Class,
  patientHomeCardTitleClampSmClass,
  patientHomeCourseRowItemLayoutClass,
  patientHomeTodaySectionStackClass,
} from "./patientHomeCardStyles";
import { cn } from "@/lib/utils";

type Props = {
  cards: ResolvedCourseCard[];
  anonymousGuest?: boolean;
  personalTierOk?: boolean;
};

export function PatientHomeCoursesRow({ cards }: Props) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <section id="patient-home-courses-row" className={patientHomeTodaySectionStackClass} aria-labelledby="patient-home-courses-heading">
      <h3 id="patient-home-courses-heading" className={cn(patientHomeBlockHeadingClass, "px-4 md:px-[18px]")}>
        Курсы
      </h3>
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
