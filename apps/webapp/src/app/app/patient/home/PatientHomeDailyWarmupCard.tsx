import type { ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, PlayCircle, Sparkles } from "lucide-react";
import type { ResolvedPatientHomeBlockItem } from "@/modules/patient-home/todayConfig";
import {
  patientHomeHeroCardGeometryClass,
  patientHomeHeroBadgeClass,
  patientHomeHeroDurationBadgeClass,
  patientHomeHeroImageSlotClass,
  patientHomeHeroSummaryClampClass,
  patientHomeHeroTextColumnClass,
  patientHomeHeroTitleClampClass,
  patientHomeCardSubtitleClampXsClass,
} from "./patientHomeCardStyles";
import { appLoginWithNextHref, stripApiMediaForAnonymousGuest } from "./patientHomeGuestNav";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import {
  patientHeroPrimaryActionClass,
  patientHeroWarmupDoneCtaClass,
  patientMutedTextClass,
} from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = {
  warmup: ResolvedPatientHomeBlockItem | null;
  personalTierOk: boolean;
  anonymousGuest: boolean;
  /**
   * Недавняя отметка разминки дня для текущего материала — на главной показываем статус вместо CTA.
   * Задаётся только при `personalTierOk` (см. `PatientHomeToday`).
   */
  warmupRecentlyCompletedHero?: boolean;
  /** Подпись под «Разминка выполнена» (cooldown). */
  warmupCooldownCaption?: string | null;
  /** Все слоты разминок дня в cooldown — hero «выполнено» без конкретной страницы. */
  allDailyWarmupsInCooldown?: boolean;
};

const FALLBACK_DURATION_BADGE_LABEL = "5 мин";

function HeroBadgeRow() {
  return (
    <div className="relative z-20 flex h-6 shrink-0 items-start justify-start gap-1.5">
      <span className={patientHomeHeroBadgeClass}>
        Разминка дня
      </span>
      <span className={patientHomeHeroDurationBadgeClass}>
        <Clock3 className="size-3.5 shrink-0" aria-hidden />
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

export function PatientHomeDailyWarmupCard({
  warmup,
  personalTierOk,
  anonymousGuest,
  warmupRecentlyCompletedHero = false,
  warmupCooldownCaption = null,
  allDailyWarmupsInCooldown = false,
}: Props) {
  const page = warmup?.page;

  if (!page) {
    if (allDailyWarmupsInCooldown && personalTierOk && !anonymousGuest) {
      const showWarmupDoneHero = warmupRecentlyCompletedHero;
      return (
        <section aria-labelledby="patient-home-warmup-heading">
          <article className={patientHomeHeroCardGeometryClass}>
            <HeroBadgeRow />
            <div className={patientHomeHeroTextColumnClass}>
              <h2 id="patient-home-warmup-heading" className={patientHomeHeroTitleClampClass}>
                Разминка дня
              </h2>
              <div className="mt-auto flex shrink-0 flex-col gap-2 pb-3 pt-6 md:pb-[34px]">
                {showWarmupDoneHero ?
                  <div className="flex min-w-0 flex-col gap-1">
                    <span
                      role="status"
                      className={cn(patientHeroWarmupDoneCtaClass, "select-none")}
                      aria-label="Разминка дня уже отмечена выполненной"
                    >
                      <CheckCircle2 className="size-4 shrink-0 sm:size-[18px] md:size-5" aria-hidden />
                      Разминка выполнена
                    </span>
                    {warmupCooldownCaption?.trim() ?
                      <p
                        className={cn(
                          patientMutedTextClass,
                          "max-w-full text-xs leading-snug -mb-2 md:-mb-3",
                        )}
                      >
                        {warmupCooldownCaption.trim()}
                      </p>
                    : null}
                  </div>
                : null}
              </div>
            </div>
            <HeroImageSlotDecor>
              <div className="mb-2 mr-2 flex size-[118px] items-center justify-center rounded-[42%] bg-white/50 ring-1 ring-[#e0e7ff] min-[380px]:size-[132px] md:mb-3 md:size-[220px] xl:size-[240px]">
                <Sparkles className="size-12 text-[var(--patient-color-primary)] opacity-80 md:size-20" />
              </div>
            </HeroImageSlotDecor>
          </article>
        </section>
      );
    }
    return (
      <section aria-labelledby="patient-home-warmup-heading">
        <article className={patientHomeHeroCardGeometryClass}>
          <HeroBadgeRow />
          <div className={patientHomeHeroTextColumnClass}>
            <h2 id="patient-home-warmup-heading" className={patientHomeHeroTitleClampClass}>
              Скоро здесь появится разминка дня
            </h2>
            <p className={patientHomeHeroSummaryClampClass}>
              Подберём короткую практику, которую удобно выполнить сегодня.
            </p>
          </div>
          <HeroImageSlotDecor>
            <div className="mb-2 mr-2 flex size-[118px] items-center justify-center rounded-[42%] bg-white/50 ring-1 ring-[#e0e7ff] min-[380px]:size-[132px] md:mb-3 md:size-[220px] xl:size-[240px]">
              <Sparkles className="size-12 text-[var(--patient-color-primary)] opacity-80 md:size-20" />
            </div>
          </HeroImageSlotDecor>
        </article>
      </section>
    );
  }

  const heroImageUrl = stripApiMediaForAnonymousGuest(page.imageUrl, anonymousGuest);
  const warmupHref = `/app/patient/content/${encodeURIComponent(page.slug)}?from=daily_warmup`;
  const warmupLinkHref = anonymousGuest ? appLoginWithNextHref(warmupHref) : warmupHref;
  const showWarmupDoneHero =
    personalTierOk && !anonymousGuest && warmupRecentlyCompletedHero;

  return (
    <section aria-labelledby="patient-home-warmup-heading">
      <article className={patientHomeHeroCardGeometryClass}>
        <HeroBadgeRow />
        <div className={patientHomeHeroTextColumnClass}>
          <h2 id="patient-home-warmup-heading" className={patientHomeHeroTitleClampClass}>
            {page.title}
          </h2>
          {page.summary?.trim() ?
            <p className={patientHomeHeroSummaryClampClass}>{page.summary.trim()}</p>
          : <div className="mt-1 min-h-8 shrink-0 md:mt-2 md:min-h-[3rem]" aria-hidden />}
          <div className="mt-auto flex shrink-0 flex-col gap-2 pb-3 pt-6 md:pb-[34px]">
            {showWarmupDoneHero ?
              <div className="flex min-w-0 flex-col gap-1">
                <span
                  role="status"
                  className={cn(patientHeroWarmupDoneCtaClass, "select-none")}
                  aria-label="Разминка дня уже отмечена выполненной"
                >
                  <CheckCircle2 className="size-4 shrink-0 sm:size-[18px] md:size-5" aria-hidden />
                  Разминка выполнена
                </span>
                {warmupCooldownCaption?.trim() ?
                  <p
                    className={cn(
                      patientMutedTextClass,
                      "max-w-full text-xs leading-snug -mb-2 md:-mb-3",
                    )}
                  >
                    {warmupCooldownCaption.trim()}
                  </p>
                : null}
              </div>
            : <Link
                href={warmupLinkHref}
                prefetch={false}
                className={cn(
                  patientHeroPrimaryActionClass,
                  "min-h-11 w-fit shrink-0 px-4 py-2 text-sm shadow-[0_6px_14px_rgba(40,77,160,0.24)] md:min-h-12 md:w-[22rem] md:pr-5 md:text-base xl:w-[24rem]",
                )}
              >
                <PlayCircle className="size-5 shrink-0 md:size-6" aria-hidden />
                Начать разминку
              </Link>
            }
            {anonymousGuest || !personalTierOk ?
              <div className="hidden h-[2.75rem] shrink-0 overflow-hidden md:block">
                {anonymousGuest ?
                  <p className={patientHomeCardSubtitleClampXsClass}>
                    Войдите, чтобы открыть материал и отмечать прогресс выполнения.
                  </p>
                : !personalTierOk ?
                  <p className={patientHomeCardSubtitleClampXsClass}>
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
              <div className="mb-2 mr-2 flex size-[118px] items-center justify-center rounded-[42%] bg-white/50 ring-1 ring-[#e0e7ff] min-[380px]:size-[132px] md:mb-3 md:size-[220px] xl:size-[240px]">
                <Sparkles className="size-12 text-[var(--patient-color-primary)] opacity-80 md:size-20" />
              </div>
            }
          />
        </HeroImageSlotDecor>
      </article>
    </section>
  );
}
