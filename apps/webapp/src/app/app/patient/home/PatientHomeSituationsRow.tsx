import Link from "next/link";
import type { ResolvedSituationChip } from "@/modules/patient-home/patientHomeResolvers";
import {
  patientHomeSituationTileMediaClass,
  patientHomeSituationTileShellClass,
  patientHomeSituationTileTitleClass,
} from "./patientHomeCardStyles";
import { cn } from "@/lib/utils";

type Props = { chips: ResolvedSituationChip[] };

function initials(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return `${a}${b}`.toUpperCase() || "—";
}

export function PatientHomeSituationsRow({ chips }: Props) {
  if (chips.length === 0) return null;

  return (
    <section id="patient-home-situations" className="flex min-w-0 flex-col gap-3" aria-labelledby="patient-home-situations-heading">
      <h2 id="patient-home-situations-heading" className="text-lg font-bold text-[var(--patient-text-primary)] lg:text-xl">
        Ситуации
      </h2>
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]">
        {chips.map((c) => (
          <Link
            key={c.itemId}
            href={c.href}
            prefetch={false}
            className={cn(patientHomeSituationTileShellClass, "transition-opacity hover:opacity-95 active:scale-[0.99]")}
          >
            <div className={patientHomeSituationTileMediaClass}>
              {c.imageUrl ?
                // eslint-disable-next-line @next/next/no-img-element -- CMS URL
                <img src={c.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
              : <span className="leading-none">{initials(c.title)}</span>}
            </div>
            <span className={patientHomeSituationTileTitleClass}>{c.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
