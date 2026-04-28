import Link from "next/link";
import type { ResolvedCourseCard } from "@/modules/patient-home/patientHomeResolvers";
import { patientHomeCardClass } from "./patientHomeCardStyles";

type Props = { cards: ResolvedCourseCard[] };

export function PatientHomeCoursesRow({ cards }: Props) {
  if (cards.length === 0) return null;

  return (
    <section aria-labelledby="patient-home-courses-heading">
      <h2 id="patient-home-courses-heading" className="mb-2 text-base font-semibold">
        Курсы
      </h2>
      <div className="-mx-1 flex flex-col gap-3">
        {cards.map((c) => (
          <Link
            key={c.itemId}
            href={c.href}
            className={`${patientHomeCardClass} block transition-colors hover:border-primary/30`}
          >
            <h3 className="text-base font-semibold">{c.title}</h3>
            {c.subtitle?.trim() ?
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.subtitle.trim()}</p>
            : null}
            <span className="mt-3 inline-flex text-sm font-medium text-primary">Подробнее</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
