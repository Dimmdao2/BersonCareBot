import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { ResolvedPatientHomeBlockItem } from "@/modules/patient-home/todayConfig";
import { patientBadgeDurationClass, patientBadgePrimaryClass, patientHomeCardHeroClass } from "./patientHomeCardStyles";
import { appLoginWithNextHref, stripApiMediaForAnonymousGuest } from "./patientHomeGuestNav";
import { patientButtonPrimaryClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = {
  warmup: ResolvedPatientHomeBlockItem | null;
  personalTierOk: boolean;
  anonymousGuest: boolean;
};

const FALLBACK_DURATION_LABEL = "≈ 5 мин";

export function PatientHomeDailyWarmupCard({ warmup, personalTierOk, anonymousGuest }: Props) {
  const page = warmup?.page;

  if (!page) {
    return (
      <section aria-labelledby="patient-home-warmup-heading">
        <article className={cn(patientHomeCardHeroClass, "relative isolate min-h-[220px] p-5 lg:p-8")}>
          <span className={patientBadgePrimaryClass}>Разминка дня</span>
          <h2
            id="patient-home-warmup-heading"
            className="mt-3 max-w-[260px] text-2xl font-extrabold leading-8 tracking-[-0.03em] text-[var(--patient-text-primary)] lg:text-4xl lg:leading-[2.75rem]"
          >
            Скоро здесь появится разминка дня
          </h2>
          <p className="mt-2 max-w-[260px] text-[15px] leading-6 text-[var(--patient-text-secondary)]">
            Подберём короткую практику, которую удобно выполнить сегодня.
          </p>
          <div
            className="pointer-events-none absolute bottom-4 right-4 flex size-[120px] items-center justify-center rounded-[40%] bg-white/50 ring-1 ring-[#e0e7ff] lg:size-[180px]"
            aria-hidden
          >
            <Sparkles className="size-12 text-[var(--patient-color-primary)] opacity-80 lg:size-16" />
          </div>
        </article>
      </section>
    );
  }

  const heroImageUrl = stripApiMediaForAnonymousGuest(page.imageUrl, anonymousGuest);
  const warmupHref = `/app/patient/content/${encodeURIComponent(page.slug)}?from=daily_warmup`;
  const warmupLinkHref = anonymousGuest ? appLoginWithNextHref(warmupHref) : warmupHref;

  return (
    <section aria-labelledby="patient-home-warmup-heading">
      <article className={cn(patientHomeCardHeroClass, "relative isolate min-h-[300px] p-5 lg:min-h-[360px] lg:p-8")}>
        <div className="relative z-10 flex min-h-[220px] flex-col pr-[min(42%,140px)] lg:min-h-[260px] lg:pr-[min(38%,200px)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className={patientBadgePrimaryClass}>Разминка дня</span>
            <span className={patientBadgeDurationClass}>{FALLBACK_DURATION_LABEL}</span>
          </div>
          <h2
            id="patient-home-warmup-heading"
            className="mt-3 max-w-[min(100%,260px)] text-[1.75rem] font-extrabold leading-8 tracking-[-0.03em] text-[var(--patient-text-primary)] lg:max-w-[min(100%,420px)] lg:text-4xl lg:leading-[2.75rem]"
          >
            {page.title}
          </h2>
          {page.summary?.trim() ?
            <p className="mt-2 max-w-[min(100%,260px)] text-[15px] leading-6 text-[var(--patient-text-secondary)] lg:max-w-[min(100%,420px)] lg:text-base lg:leading-6">
              {page.summary.trim()}
            </p>
          : null}
          <div className="mt-auto flex flex-col gap-2 pt-6">
            <Link href={warmupLinkHref} prefetch={false} className={patientButtonPrimaryClass}>
              Начать разминку
            </Link>
            {anonymousGuest ?
              <p className="max-w-[260px] text-xs leading-5 text-[var(--patient-text-secondary)]">
                Войдите, чтобы открыть материал и отмечать прогресс выполнения.
              </p>
            : !personalTierOk ?
              <p className="max-w-[260px] text-xs leading-5 text-[var(--patient-text-secondary)]">
                Активируйте профиль пациента, чтобы отмечать прогресс выполнения.
              </p>
            : null}
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-0 right-0 z-[1] flex h-[min(52%,220px)] w-[min(52%,190px)] items-end justify-end lg:h-[min(55%,320px)] lg:w-[min(48%,320px)]">
          {heroImageUrl ?
            // eslint-disable-next-line @next/next/no-img-element -- CMS URL может быть внешним; без remotePatterns в конфиге.
            <img
              src={heroImageUrl}
              alt=""
              className="max-h-full max-w-full object-contain object-bottom drop-shadow-md"
              loading="lazy"
            />
          : <div
              className="mb-2 mr-1 flex size-[140px] items-center justify-center rounded-[40%] bg-white/50 ring-1 ring-[#e0e7ff] lg:size-[200px]"
              aria-hidden
            >
              <Sparkles className="size-14 text-[var(--patient-color-primary)] opacity-80 lg:size-16" />
            </div>
          }
        </div>
      </article>
    </section>
  );
}
