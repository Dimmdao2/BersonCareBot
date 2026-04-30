import type { ReactNode } from "react";
import Link from "next/link";
import { PlayCircle, Sparkles } from "lucide-react";
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
          <div className={patientHomeHeroTextColumnClass}>
            <div className="flex flex-nowrap items-center gap-2">
              <span className={cn(patientBadgePrimaryClass, "max-w-[min(100%,11rem)] shrink-0 truncate")}>Разминка дня</span>
              <span className={cn(patientBadgeDurationClass, "max-w-[min(100%,6rem)] shrink-0 truncate")}>
                {FALLBACK_DURATION_BADGE_LABEL}
              </span>
            </div>
            <h2 id="patient-home-warmup-heading" className={patientHomeHeroTitleClampClass}>
              Скоро здесь появится разминка дня
            </h2>
            <p className={patientHomeHeroDurationAccentClass}>{FALLBACK_DURATION_ACCENT_LABEL}</p>
            <p className={patientHomeHeroSummaryClampClass}>
              Подберём короткую практику, которую удобно выполнить сегодня.
            </p>
            <div className="mt-auto flex min-h-0 flex-1 flex-col justify-end gap-2 pt-4">
              <div className="h-12 shrink-0" aria-hidden />
              <div className="h-[2.75rem] shrink-0" aria-hidden />
            </div>
          </div>
          <HeroImageSlotDecor>
            <div className="mb-3 mr-2 flex size-[132px] items-center justify-center rounded-[42%] bg-white/50 ring-1 ring-[#e0e7ff] min-[360px]:size-[150px] min-[380px]:size-[170px] lg:size-[220px]">
              <Sparkles className="size-14 text-[var(--patient-color-primary)] opacity-80 lg:size-20" />
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
        <div className={patientHomeHeroTextColumnClass}>
          <div className="flex flex-nowrap items-center gap-2">
            <span className={cn(patientBadgePrimaryClass, "max-w-[min(100%,11rem)] shrink-0 truncate")}>Разминка дня</span>
            <span className={cn(patientBadgeDurationClass, "max-w-[min(100%,6rem)] shrink-0 truncate")}>
              {FALLBACK_DURATION_BADGE_LABEL}
            </span>
          </div>
          <h2 id="patient-home-warmup-heading" className={patientHomeHeroTitleClampClass}>
            {page.title}
          </h2>
          <p className={patientHomeHeroDurationAccentClass}>{FALLBACK_DURATION_ACCENT_LABEL}</p>
          {page.summary?.trim() ?
            <p className={patientHomeHeroSummaryClampClass}>{page.summary.trim()}</p>
          : <div className="mt-2 min-h-[3rem] shrink-0" aria-hidden />}
          <div className="mt-auto flex min-h-0 flex-1 flex-col justify-end gap-2 pt-4">
            <Link
              href={warmupLinkHref}
              prefetch={false}
              className={cn(patientButtonPrimaryClass, "min-h-12 w-fit shrink-0 rounded-2xl px-4 pr-5")}
            >
              <PlayCircle className="size-5 shrink-0" aria-hidden />
              Начать разминку
            </Link>
            <div className="h-[2.75rem] shrink-0 overflow-hidden">
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
          </div>
        </div>
        <HeroImageSlotDecor>
          <PatientHomeSafeImage
            src={heroImageUrl}
            alt=""
            className="max-h-full max-w-full object-contain object-bottom drop-shadow-lg"
            loading="lazy"
            fallback={
              <div className="mb-3 mr-2 flex size-[132px] items-center justify-center rounded-[42%] bg-white/50 ring-1 ring-[#e0e7ff] min-[360px]:size-[150px] min-[380px]:size-[170px] lg:size-[220px]">
                <Sparkles className="size-14 text-[var(--patient-color-primary)] opacity-80 lg:size-20" />
              </div>
            }
          />
        </HeroImageSlotDecor>
      </article>
    </section>
  );
}
