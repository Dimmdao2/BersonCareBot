import Link from "next/link";
import type { ResolvedSituationChip } from "@/modules/patient-home/patientHomeResolvers";

type Props = { chips: ResolvedSituationChip[] };

function initials(title: string): string {
  const t = title.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return t.slice(0, 2).toUpperCase();
}

export function PatientHomeSituationsRow({ chips }: Props) {
  if (chips.length === 0) return null;

  return (
    <section aria-labelledby="patient-home-situations-heading">
      <h2 id="patient-home-situations-heading" className="mb-2 text-base font-semibold">
        Ситуации
      </h2>
      <div className="-mx-1 flex gap-3 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]">
        {chips.map((c) => (
          <Link
            key={c.itemId}
            href={c.href}
            className="flex w-[4.5rem] shrink-0 flex-col items-center gap-2 rounded-2xl border border-border bg-card p-2 text-center shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/30"
          >
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-muted text-xs font-semibold text-muted-foreground">
              {c.imageUrl ?
                // eslint-disable-next-line @next/next/no-img-element -- CMS URL
                <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
              : <span aria-hidden>{initials(c.title)}</span>}
            </div>
            <span className="line-clamp-2 w-full text-[11px] font-medium leading-tight text-foreground">{c.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
