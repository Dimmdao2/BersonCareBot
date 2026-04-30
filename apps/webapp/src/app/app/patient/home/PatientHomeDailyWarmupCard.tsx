import type { ReactNode } from "react";
import Link from "next/link";
import { Clock3, PlayCircle, Sparkles } from "lucide-react";
import type { ResolvedPatientHomeBlockItem } from "@/modules/patient-home/todayConfig";
import {
  patientBadgeDurationClass,
  patientBadgePrimaryClass,
  patientHomeHeroCardGeometryClass,
  patientHomeHeroDurationAccentClass,
  patientHomeHeroImageSlotClass,
  patientHomeHeroSummaryClampClass,
  patientHomeHeroTextColumnClass,
  patientHomeHeroTitleClampClass,
} from "./patientHomeCardStyles";
import { appLoginWithNextHref, stripApiMediaForAnonymousGuest } from "./patientHomeGuestNav";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import { patientButtonPrimaryClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = {
  warmup: ResolvedPatientHomeBlockItem | null;
  personalTierOk: boolean;
  anonymousGuest: boolean;
};

const FALLBACK_DURATION_BADGE_LABEL = "5 мин";
const FALLBACK_DURATION_ACCENT_LABEL = "5 минут";

function HeroBadgeRow() {
  return (
    <div className="relative z-20 flex h-7 shrink-0 items-start justify-between gap-2">
      <span
        className={cn(
          patientBadgePrimaryClass,
          "h-7 max-w-[min(100%,10rem)] whitespace-nowrap px-3 text-xs uppercase leading-none",
        )}
      >
        Разминка дня
      </span>
      <span
        className={cn(
          patientBadgeDurationClass,
          "h-7 max-w-[min(100%,6rem)] gap-1.5 whitespace-nowrap px-3 text-xs leading-none",
        )}
      >
        <Clock3 className="size-4 shrink-0" aria-hidden />
        {FALLBACK_DURATION_BADGE_LABEL}
      </span>
    </div>
  );
}

function HeroImageSlotDecor({ children }: { children: ReactNode }) {
  return (
    <div className={patientHomeHeroImageSlotClass} aria-hidden>
      {children}
    </div>
  );
}

export function PatientHomeDailyWarmupCard({ warmup, personalTierOk, anonymousGuest }: Props) {
  const page = warmup?.page;

  if (!page) {
    return (
      <section aria-labelledby="patient-home-warmup-heading">
        <article className={patientHomeHeroCardGeometryClass}>
          <HeroBadgeRow />
          <div className={patientHomeHeroTextColumnClass}>
            <h2 id="patient-home-warmup-heading" className={patientHomeHeroTitleClampClass}>
              Скоро здесь появится разминка дня
            </h2>
            <p className={patientHomeHeroDurationAccentClass}>{FALLBACK_DURATION_ACCENT_LABEL}</p>
            <p className={patientHomeHeroSummaryClampClass}>
              Подберём короткую практику, которую удобно выполнить сегодня.
            </p>
            <div className="mt-auto flex min-h-0 flex-1 flex-col justify-end gap-2 pt-3 lg:pt-4">
              <div className="h-10 shrink-0 lg:h-12" aria-hidden />
              <div className="hidden h-[2.75rem] shrink-0 lg:block" aria-hidden />
            </div>
          </div>
          <HeroImageSlotDecor>
            <div className="mb-2 mr-2 flex size-[118px] items-center justify-center rounded-[42%] bg-white/50 ring-1 ring-[#e0e7ff] min-[380px]:size-[132px] lg:mb-3 lg:size-[220px] xl:size-[240px]">
              <Sparkles className="size-12 text-[var(--patient-color-primary)] opacity-80 lg:size-20" />
            </div>
          </HeroImageSlotDecor>
        </article>
      </section>
    );
  }

  const heroImageUrl = stripApiMediaForAnonymousGuest(page.imageUrl, anonymousGuest);
  const warmupHref = `/app/patient/content/${encodeURIComponent(page.slug)}?from=daily_warmup`;
  const warmupLinkHref = anonymousGuest ? appLoginWithNextHref(warmupHref) : warmupHref;

  return (
    <section aria-labelledby="patient-home-warmup-heading">
      <article className={patientHomeHeroCardGeometryClass}>
        <HeroBadgeRow />
        <div className={patientHomeHeroTextColumnClass}>
          <h2 id="patient-home-warmup-heading" className={patientHomeHeroTitleClampClass}>
            {page.title}
          </h2>
          <p className={patientHomeHeroDurationAccentClass}>{FALLBACK_DURATION_ACCENT_LABEL}</p>
          {page.summary?.trim() ?
            <p className={patientHomeHeroSummaryClampClass}>{page.summary.trim()}</p>
          : <div className="mt-1 min-h-8 shrink-0 md:mt-2 md:min-h-[3rem]" aria-hidden />}
          <div className="mt-auto flex min-h-0 flex-1 flex-col justify-end gap-2 pt-3 lg:pt-4">
            <Link
              href={warmupLinkHref}
              prefetch={false}
              className={cn(
                patientButtonPrimaryClass,
                "min-h-10 w-fit shrink-0 rounded-[14px] bg-[#4f46e5] px-4 text-sm font-bold shadow-[0_6px_14px_rgba(79,70,229,0.2)] hover:bg-[#4338ca] active:bg-[#4338ca] lg:min-h-12 lg:rounded-2xl lg:pr-5 lg:text-base",
              )}
            >
              <PlayCircle className="size-4 shrink-0 lg:size-5" aria-hidden />
              Начать разминку
            </Link>
            {anonymousGuest || !personalTierOk ?
              <div className="hidden h-[2.75rem] shrink-0 overflow-hidden lg:block">
                {anonymousGuest ?
                  <p className="line-clamp-2 text-xs leading-5 text-[var(--patient-text-secondary)]">
                    Войдите, чтобы открыть материал и отмечать прогресс выполнения.
                  </p>
                : !personalTierOk ?
                  <p className="line-clamp-2 text-xs leading-5 text-[var(--patient-text-secondary)]">
                    Активируйте профиль пациента, чтобы отмечать прогресс выполнения.
                  </p>
                : null}
              </div>
            : null}
          </div>
        </div>
        <HeroImageSlotDecor>
          <PatientHomeSafeImage
            src={heroImageUrl}
            alt=""
            className="h-full w-full object-contain object-right-bottom drop-shadow-lg"
            loading="lazy"
            fallback={
              <div className="mb-2 mr-2 flex size-[118px] items-center justify-center rounded-[42%] bg-white/50 ring-1 ring-[#e0e7ff] min-[380px]:size-[132px] lg:mb-3 lg:size-[220px] xl:size-[240px]">
                <Sparkles className="size-12 text-[var(--patient-color-primary)] opacity-80 lg:size-20" />
              </div>
            }
          />
        </HeroImageSlotDecor>
      </article>
    </section>
  );
}
