import Link from "next/link";
import { Sparkles } from "lucide-react";
import { patientBadgeDurationClass, patientBadgePrimaryClass, patientHomeCardHeroClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { patientButtonPrimaryClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

const FALLBACK_DURATION_LABEL = "≈ 5 мин";

export type PatientHomeDailyWarmupCardProps = {
  title: string;
  summary: string;
  href: string;
  imageUrl?: string | null;
  /** Длительность в минутах из CMS; если нет — показываем согласованный fallback (см. LOG Phase 3). */
  durationMinutes?: number | null;
};

function formatDuration(minutes: number): string {
  if (minutes <= 0) return FALLBACK_DURATION_LABEL;
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
  }
  return `${minutes} мин`;
}

/**
 * Hero «разминка дня»: градиент, бейджи, изображение справа/снизу или декоративный fallback.
 */
export function PatientHomeDailyWarmupCard({ title, summary, href, imageUrl, durationMinutes }: PatientHomeDailyWarmupCardProps) {
  const durationLabel =
    durationMinutes != null && durationMinutes > 0 ? formatDuration(durationMinutes) : FALLBACK_DURATION_LABEL;

  return (
    <article className={cn(patientHomeCardHeroClass, "relative isolate min-h-[300px] p-5 lg:min-h-[360px] lg:p-8")}>
      <div className="relative z-10 flex min-h-[220px] flex-col pr-[min(42%,140px)] lg:min-h-[260px] lg:pr-[min(38%,200px)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className={patientBadgePrimaryClass}>Разминка дня</span>
          <span className={patientBadgeDurationClass}>{durationLabel}</span>
        </div>
        <h2 className="mt-3 max-w-[min(100%,260px)] text-[1.75rem] font-extrabold leading-8 tracking-[-0.03em] text-[var(--patient-text-primary)] lg:max-w-[min(100%,420px)] lg:text-4xl lg:leading-[2.75rem]">
          {title}
        </h2>
        <p className="mt-2 max-w-[min(100%,260px)] text-[15px] leading-6 text-[var(--patient-text-secondary)] lg:max-w-[min(100%,420px)] lg:text-base lg:leading-6">
          {summary}
        </p>
        <div className="mt-auto flex flex-wrap gap-3 pt-6">
          <Link href={href} prefetch={false} className={patientButtonPrimaryClass}>
            Начать разминку
          </Link>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-0 right-0 z-[1] flex h-[min(52%,220px)] w-[min(52%,190px)] items-end justify-end lg:h-[min(55%,320px)] lg:w-[min(48%,320px)]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- CMS URL может быть внешним; без remotePatterns в конфиге.
          <img
            src={imageUrl}
            alt=""
            className="max-h-full max-w-full object-contain object-bottom drop-shadow-md"
            loading="lazy"
          />
        ) : (
          <div
            className="mb-2 mr-1 flex size-[140px] items-center justify-center rounded-[40%] bg-white/50 ring-1 ring-[#e0e7ff] lg:size-[200px]"
            aria-hidden
          >
            <Sparkles className="size-14 text-[var(--patient-color-primary)] opacity-80 lg:size-16" />
          </div>
        )}
      </div>
    </article>
  );
}
