import Link from "next/link";
import type { ResolvedCourseCard } from "@/modules/patient-home/patientHomeResolvers";
import { patientHomeCardCompactClass } from "./patientHomeCardStyles";
import { cn } from "@/lib/utils";

type Props = { cards: ResolvedCourseCard[] };

export function PatientHomeCoursesRow({ cards }: Props) {
  if (cards.length === 0) return null;

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
                "flex min-h-[72px] flex-col justify-center transition-opacity hover:opacity-95 active:scale-[0.99]",
              )}
            >
              <span className="text-sm font-bold text-[var(--patient-text-primary)]">{c.title}</span>
              {c.subtitle?.trim() ?
                <span className="mt-1 line-clamp-2 text-xs text-[var(--patient-text-secondary)]">{c.subtitle.trim()}</span>
              : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
