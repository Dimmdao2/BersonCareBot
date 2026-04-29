import Link from "next/link";
import type { ContentSectionRow } from "@/infra/repos/pgContentSections";
import { cn } from "@/lib/utils";

type PatientHomeSituationsRowProps = {
  sections: ContentSectionRow[];
};

function initials(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return `${a}${b}`.toUpperCase() || "—";
}

/**
 * Быстрые ситуации: горизонтальные плитки без привязки цвета к slug/title.
 */
export function PatientHomeSituationsRow({ sections }: PatientHomeSituationsRowProps) {
  if (sections.length === 0) return null;
  return (
    <section id="patient-home-situations" className="flex min-w-0 flex-col gap-3">
      <h2 className="text-lg font-bold text-[var(--patient-text-primary)] lg:text-xl">Разделы</h2>
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]">
        {sections.map((s) => {
          const href = `/app/patient/sections/${encodeURIComponent(s.slug)}`;
          return (
            <Link
              key={s.id}
              href={href}
              prefetch={false}
              className={cn(
                "flex w-[5.5rem] shrink-0 flex-col items-center rounded-2xl border border-[var(--patient-border)] bg-[var(--patient-card-bg)] p-2 text-center shadow-sm transition-colors",
                "hover:border-[var(--patient-color-primary)]/40 hover:shadow-md",
                "lg:w-[6.5rem] lg:rounded-3xl lg:p-2.5",
              )}
            >
              <div
                className="flex size-14 items-center justify-center rounded-2xl bg-muted/80 text-xs font-bold text-[var(--patient-text-secondary)] lg:size-16"
                aria-hidden
              >
                <span className="leading-none">{initials(s.title)}</span>
              </div>
              <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-center text-xs font-medium leading-4 text-[var(--patient-text-primary)] lg:text-sm lg:leading-5">
                {s.title}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
