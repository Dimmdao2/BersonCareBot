import Image from "next/image";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";

const primaryCta = cn(
  buttonVariants({ size: "lg" }),
  "h-9 w-full justify-center rounded-xl bg-[#2F55B7] px-4 text-xs font-semibold text-white hover:bg-[#2448A5] sm:h-10 sm:w-auto sm:text-base",
);

export function HeroSection() {
  return (
    <section className="overflow-x-hidden bg-gradient-to-br from-[#EEF4FF] via-[#F4F7FF] to-white py-10 lg:py-20">
      <div className="mx-auto max-w-full px-4 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        {/* md: — двухколоночная с телефонами справа */}
        <div className="grid items-center gap-7 md:grid-cols-2 md:gap-8 lg:gap-12">

          {/* Левая колонка — текст */}
          <div className="relative flex flex-col items-start pr-[38%] sm:pr-[34%] md:pr-0">
            <h1 className="text-[1.45rem] font-semibold leading-[1.12] tracking-[-0.02em] text-[#17264A] max-[439px]:text-[1.08rem] max-[439px]:leading-[1.15] sm:text-[2.4rem] lg:text-[3rem] lg:leading-[1.05] lg:tracking-[-0.04em]">
              BersonCare — приложение для вашего здоровья
            </h1>

            <p className="mt-2.5 text-xs leading-5 text-[#667085] sm:text-base sm:leading-[1.75]">
              Программа реабилитации, разминки, напоминания, дневник самочувствия и запись на приём — в одном приложении.
            </p>

            <div className="mt-4 flex w-full flex-col gap-2 sm:mt-7 sm:w-auto sm:flex-row sm:gap-3">
              <Link href={LANDING_INSTALL_HASH} className={primaryCta}>
                Установить приложение
              </Link>
            </div>

            <p className="mt-3.5 flex items-start gap-2 text-[11px] leading-5 text-[#98A2B3] sm:mt-5 sm:text-sm sm:leading-6">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Работает как PWA (Прогрессивное Веб Приложение). Установка не требует магазина приложений.
              </span>
            </p>

            {/* Mobile: телефоны в шапке первого экрана (правый верх) */}
            <div className="pointer-events-none absolute -right-7 -top-3 w-[48%] min-w-[140px] max-w-[210px] md:hidden">
              <Image
                src="/images/landing/hero-phones.png"
                alt=""
                width={522}
                height={515}
                priority
                sizes="(max-width: 390px) 44vw, 210px"
                className="h-auto w-full drop-shadow-2xl"
              />
            </div>
          </div>

          {/* Правая колонка — телефоны */}
          <div className="relative hidden items-center justify-end md:flex md:justify-end">
            <div
              className="pointer-events-none absolute inset-[8%] rounded-full bg-[#2F55B7]/[0.06] blur-3xl"
              aria-hidden
            />
            <Image
              src="/images/landing/hero-phones.png"
              alt="Экраны приложения BersonCare: программа реабилитации, главная и дневник"
              width={522}
              height={515}
              priority
              sizes="(max-width: 390px) 70vw, (max-width: 768px) 86vw, (max-width: 1024px) 46vw, 560px"
              className="relative h-auto w-[92%] max-w-[420px] translate-x-7 drop-shadow-2xl sm:w-full sm:max-w-[500px] sm:translate-x-3 md:max-w-none md:translate-x-0"
            />
          </div>

        </div>
      </div>
    </section>
  );
}
