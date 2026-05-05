import Link from "next/link";
import type { ResolvedSituationChip } from "@/modules/patient-home/patientHomeResolvers";
import {
  patientHomeBlockHeadingClass,
  patientHomeCardClass,
  patientHomeSituationsCardGeometryClass,
  patientHomeSituationsCardMobileChromeClass,
  patientHomeSituationTileMediaClass,
  patientHomeSituationTileShellClass,
  patientHomeSituationTileTitleClass,
  patientHomeTodayCardScrollRowBleedClass,
} from "./patientHomeCardStyles";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import { patientHomeChipFallbackImageSrc, patientHomeChipImageSrc } from "./patientHomeChipImageSrc";
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
      className={cn(
        patientHomeCardClass,
        patientHomeSituationsCardGeometryClass,
        patientHomeSituationsCardMobileChromeClass,
      )}
      aria-label="Выберите пользу для себя"
    >
      <div className="min-w-0">
        <h3
          id="patient-home-situations-heading"
          aria-hidden="true"
          className={cn(
            patientHomeBlockHeadingClass,
            "hidden shrink-0 lg:block",
          )}
        >
          Выберите пользу для себя:
        </h3>
        <div className={patientHomeTodayCardScrollRowBleedClass}>
          {chips.map((c) => (
            <Link
              key={c.itemId}
              href={c.href}
              prefetch={false}
              className={cn(
                patientHomeSituationTileShellClass,
                "group transition-opacity hover:opacity-95 active:scale-[0.99]",
              )}
            >
              <div
                className={cn(
                  "rounded-[1.4rem] p-[2px] transition-[transform,box-shadow] duration-200 ease-out motion-reduce:transition-none",
                  "ring-1 ring-[var(--patient-border)]/50 group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-2 group-hover:ring-[var(--patient-color-primary-soft)]",
                  "motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:shadow-none motion-reduce:group-hover:ring-1",
                  "group-focus-visible:-translate-y-0.5 group-focus-visible:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-[var(--patient-color-primary-soft)]",
                  "motion-reduce:group-focus-visible:translate-y-0 motion-reduce:group-focus-visible:shadow-none motion-reduce:group-focus-visible:ring-1",
                )}
              >
                <div className={patientHomeSituationTileMediaClass}>
                  <PatientHomeSafeImage
                    src={patientHomeChipImageSrc(c.imageUrl)}
                    fallbackSrc={patientHomeChipFallbackImageSrc(c.imageUrl)}
                    alt=""
                    width={64}
                    height={64}
                    className="block h-full w-full max-h-full max-w-full object-cover"
                    loading="lazy"
                    decoding="async"
                    fallback={<span className="text-xs font-semibold leading-none">{initials(c.title)}</span>}
                  />
                </div>
              </div>
              <span className={patientHomeSituationTileTitleClass}>{c.title}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
