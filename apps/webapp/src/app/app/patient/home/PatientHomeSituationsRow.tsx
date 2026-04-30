import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import type { ResolvedSituationChip } from "@/modules/patient-home/patientHomeResolvers";
import {
  patientHomeCardClass,
  patientHomeSituationTileMediaClass,
  patientHomeSituationTileShellClass,
  patientHomeSituationTileTitleClass,
} from "./patientHomeCardStyles";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
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
    <section
      id="patient-home-situations"
      className={cn(patientHomeCardClass, "flex min-w-0 flex-col gap-4 p-4 lg:h-[170px] lg:p-5")}
      aria-labelledby="patient-home-situations-heading"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="patient-home-situations-heading"
          className="text-base font-medium leading-6 text-[var(--patient-text-primary)] lg:text-lg"
        >
          Выберите ситуацию
        </h2>
        <Link
          href={routePaths.patientSectionsIndex}
          prefetch={false}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--patient-color-primary)]"
        >
          Все ситуации
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
        {chips.map((c) => (
          <Link
            key={c.itemId}
            href={c.href}
            prefetch={false}
            className={cn(patientHomeSituationTileShellClass, "transition-opacity hover:opacity-95 active:scale-[0.99]")}
          >
            <div className={patientHomeSituationTileMediaClass}>
              <PatientHomeSafeImage
                src={c.imageUrl}
                alt=""
                className="size-full object-cover"
                loading="lazy"
                fallback={<span className="leading-none">{initials(c.title)}</span>}
              />
            </div>
            <span className={patientHomeSituationTileTitleClass}>{c.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
