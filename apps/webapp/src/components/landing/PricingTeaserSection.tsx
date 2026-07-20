import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { landingBodySecondary, landingContainer, landingCtaPrimary, landingH2 } from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

export function PricingTeaserSection() {
  return (
    <section id="pricing" className="scroll-mt-[80px] bg-[#FAF9F4] py-14 sm:py-16 lg:py-24">
      <div className={landingContainer}>
        <div className="rounded-[24px] border border-[#D9E2EC] bg-white p-6 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:p-10">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#406CA7] sm:text-[0.8125rem]">
              Тарифы
            </p>
            <h2 className={cn(landingH2, "mt-2")}>Условия запуска — перед релизом</h2>
            <p className={cn(landingBodySecondary, "mt-3")}>
              Мы опубликуем тарифы и состав пакетов отдельно. Сейчас можно создать кабинет
              специалиста или запросить демо для клиники.
            </p>
          </div>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row lg:mt-0 lg:shrink-0 lg:flex-col">
            <Link href="/app?intent=specialist" className={landingCtaPrimary}>
              Создать кабинет
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/app/contact-support?from=clinic-demo"
              className="inline-flex min-h-14 items-center justify-center rounded-full px-6 text-base font-semibold text-[#406CA7] transition hover:bg-[#F3F6FA] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#406CA7]/20"
            >
              Демо для клиники
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
