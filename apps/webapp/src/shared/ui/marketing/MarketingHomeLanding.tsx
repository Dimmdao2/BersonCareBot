import type { ReactNode } from "react";
import { Activity, BookOpen, CalendarHeart, HeartPulse, PlayCircle, Sparkles } from "lucide-react";
import { LegalFooterLinks } from "@/shared/ui/LegalFooterLinks";
import { MarketingLandingGallery } from "@/shared/ui/marketing/MarketingLandingGallery";
import { MarketingLandingImage } from "@/shared/ui/marketing/MarketingLandingImage";
import { MARKETING_LANDING_AUTHOR_PHOTO } from "@/shared/ui/marketing/marketingLandingGallery";
import { cn } from "@/lib/utils";

type MarketingHomeLandingProps = {
  installSlot: ReactNode;
};

const featureCard = cn(
  "flex items-start gap-3 rounded-[10px] border border-[#e5e7eb] bg-white/90 p-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.04)] backdrop-blur-[2px]",
);

/** Маркетинговая обложка `/`: визуально в тон пациентскому приложению (primary #284da0, карточки). */
export function MarketingHomeLanding({ installSlot }: MarketingHomeLandingProps) {
  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-[linear-gradient(165deg,#e8eefb_0%,#ffffff_42%,#f4f6fb_100%)] text-[#111827]">
      <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-[#284da0]/[0.12] blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-20 top-48 h-72 w-72 rounded-full bg-[#284da0]/[0.08] blur-3xl" aria-hidden />

      <header className="relative z-10 border-b border-[#e5e7eb]/80 bg-white/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-baseline gap-2 px-4 py-4 md:max-w-4xl">
          <span className="font-[family-name:var(--font-roboto-heading)] text-xl font-bold tracking-tight text-[#284da0] md:text-2xl">
            BersonCare
          </span>
          <span className="hidden text-sm text-[#98a2b3] sm:inline">кабинет на телефоне</span>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-10 md:max-w-4xl md:gap-12 md:py-14">
        <div className="relative overflow-hidden rounded-[12px] border border-[#dce4f5] bg-white/95 p-6 shadow-[0_12px_40px_rgba(40,77,160,0.08)] md:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#284da0]/10 blur-2xl" aria-hidden />
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#284da0]/90">Для пациентов</p>
          <h1 className="mt-3 max-w-xl font-[family-name:var(--font-roboto-heading)] text-2xl font-bold leading-tight tracking-tight text-[#172f62] md:text-3xl">
            Разминки, видео и программа реабилитации в одном приложении
          </h1>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className={featureCard}>
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#284da0]" aria-hidden />
              <span className="text-sm leading-snug">Ежедневные разминки и материалы</span>
            </div>
            <div className={featureCard}>
              <PlayCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#284da0]" aria-hidden />
              <span className="text-sm leading-snug">Видео упражнений и инструкции</span>
            </div>
            <div className={featureCard}>
              <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-[#284da0]" aria-hidden />
              <span className="text-sm leading-snug">Советы и мотивация</span>
            </div>
            <div className={featureCard}>
              <CalendarHeart className="mt-0.5 h-5 w-5 shrink-0 text-[#284da0]" aria-hidden />
              <span className="text-sm leading-snug">Запись на приём в офис</span>
            </div>
            <div className={featureCard}>
              <HeartPulse className="mt-0.5 h-5 w-5 shrink-0 text-[#284da0]" aria-hidden />
              <span className="text-sm leading-snug">Помощь при острой боли</span>
            </div>
            <div className={featureCard}>
              <Activity className="mt-0.5 h-5 w-5 shrink-0 text-[#284da0]" aria-hidden />
              <span className="text-sm leading-snug">Программа реабилитации под рукой</span>
            </div>
          </div>
        </div>

        <MarketingLandingGallery />

        {installSlot}

        <section className="overflow-hidden rounded-[12px] border border-[#e5e7eb] bg-white/95 p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)] md:p-8">
          <h2 className="font-[family-name:var(--font-roboto-heading)] text-lg font-semibold text-[#172f62]">Обо мне</h2>
          <div className="mt-5 flex flex-col gap-6 md:flex-row md:items-start">
            <div className="mx-auto shrink-0 md:mx-0">
              <MarketingLandingImage
                src={`/landing/${MARKETING_LANDING_AUTHOR_PHOTO}`}
                alt="Дмитрий Берсон"
                ratio="square"
                className="md:max-w-[200px]"
              />
            </div>
            <div className="min-w-0 flex-1 text-sm leading-relaxed text-[#374151]">
              <p>Практикующий реабилитолог Дмитрий Берсон. Подробнее — на сайте специалиста.</p>
              <p className="mt-4">
                <a
                  href="https://dmitryberson.ru"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#284da0] underline decoration-[#284da0]/35 underline-offset-[3px] transition-colors hover:decoration-[#284da0]"
                >
                  dmitryberson.ru
                </a>
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 mt-auto border-t border-[#e5e7eb]/80 bg-white/60 py-6 backdrop-blur-sm">
        <LegalFooterLinks />
      </footer>
    </div>
  );
}
