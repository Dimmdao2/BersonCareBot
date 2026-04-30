import type { ReactNode } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { ResolvedPatientHomeBlockItem } from "@/modules/patient-home/todayConfig";
import {
  patientBadgeDurationClass,
  patientBadgePrimaryClass,
  patientHomeHeroAccentBarFillClass,
  patientHomeHeroAccentBarTrackClass,
  patientHomeHeroCardGeometryClass,
  patientHomeHeroImageSlotClass,
  patientHomeHeroSummaryClampClass,
  patientHomeHeroTextColumnClass,
  patientHomeHeroTitleClampClass,
} from "./patientHomeCardStyles";
import { appLoginWithNextHref, stripApiMediaForAnonymousGuest } from "./patientHomeGuestNav";
import { patientButtonPrimaryClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = {
  warmup: ResolvedPatientHomeBlockItem | null;
  personalTierOk: boolean;
  anonymousGuest: boolean;
};

const FALLBACK_DURATION_LABEL = "≈ 5 мин";

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
                {FALLBACK_DURATION_LABEL}
              </span>
            </div>
            <div className={patientHomeHeroAccentBarTrackClass}>
              <div className={patientHomeHeroAccentBarFillClass} style={{ width: "38%" }} />
            </div>
            <h2 id="patient-home-warmup-heading" className={patientHomeHeroTitleClampClass}>
              Скоро здесь появится разминка дня
            </h2>
            <p className={patientHomeHeroSummaryClampClass}>
              Подберём короткую практику, которую удобно выполнить сегодня.
            </p>
            <div className="mt-auto flex min-h-0 flex-1 flex-col justify-end gap-2 pt-4">
              <div className="h-12 shrink-0" aria-hidden />
              <div className="h-[2.75rem] shrink-0" aria-hidden />
            </div>
          </div>
          <HeroImageSlotDecor>
            <div className="flex size-[112px] items-center justify-center rounded-[40%] bg-white/50 ring-1 ring-[#e0e7ff] lg:size-[132px]">
              <Sparkles className="size-11 text-[var(--patient-color-primary)] opacity-80 lg:size-14" />
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
              {FALLBACK_DURATION_LABEL}
            </span>
          </div>
          <div className={patientHomeHeroAccentBarTrackClass}>
            <div className={patientHomeHeroAccentBarFillClass} style={{ width: "100%" }} />
          </div>
          <h2 id="patient-home-warmup-heading" className={patientHomeHeroTitleClampClass}>
            {page.title}
          </h2>
          {page.summary?.trim() ?
            <p className={patientHomeHeroSummaryClampClass}>{page.summary.trim()}</p>
          : <div className="mt-2 min-h-[3rem] shrink-0" aria-hidden />}
          <div className="mt-auto flex min-h-0 flex-1 flex-col justify-end gap-2 pt-4">
            <Link href={warmupLinkHref} prefetch={false} className={cn(patientButtonPrimaryClass, "shrink-0")}>
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
          {heroImageUrl ?
            // eslint-disable-next-line @next/next/no-img-element -- CMS URL может быть внешним; без remotePatterns в конфиге.
            <img
              src={heroImageUrl}
              alt=""
              className="max-h-full max-w-full object-contain object-bottom drop-shadow-md"
              loading="lazy"
            />
          : <div className="flex size-[112px] items-center justify-center rounded-[40%] bg-white/50 ring-1 ring-[#e0e7ff] lg:size-[132px]">
              <Sparkles className="size-11 text-[var(--patient-color-primary)] opacity-80 lg:size-14" />
            </div>
          }
        </HeroImageSlotDecor>
      </article>
    </section>
  );
}
