import Link from "next/link";
import { patientHomeCardCompactClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { cn } from "@/lib/utils";

export type PatientHomeCourseRowItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
};

type PatientHomeCoursesRowProps = {
  items: PatientHomeCourseRowItem[];
};

/**
 * Вертикальный список курсов на patient compact cards (§10.10).
 */
export function PatientHomeCoursesRow({ items }: PatientHomeCoursesRowProps) {
  if (items.length === 0) return null;

  return (
    <section id="patient-home-courses-row" className="flex flex-col gap-2">
      <h2 className="text-base font-bold text-[var(--patient-text-primary)]">Курсы</h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((c) => (
          <li key={c.id}>
            <Link
              href={c.href}
              prefetch={false}
              className={cn(
                patientHomeCardCompactClass,
                "flex min-h-[72px] flex-col justify-center transition-opacity hover:opacity-95 active:scale-[0.99]",
              )}
            >
              <span className="text-sm font-bold text-[var(--patient-text-primary)]">{c.title}</span>
              {c.subtitle ? (
                <span className="mt-1 line-clamp-2 text-xs text-[var(--patient-text-secondary)]">{c.subtitle}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
