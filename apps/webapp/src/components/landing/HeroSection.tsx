import Image from "next/image";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";

const primaryCta = cn(
  buttonVariants({ size: "lg" }),
  "w-full justify-center rounded-xl bg-[#2F55B7] text-base font-semibold text-white hover:bg-[#2448A5] sm:w-auto",
);

const secondaryCta = cn(
  buttonVariants({ size: "lg", variant: "outline" }),
  "w-full justify-center rounded-xl border-[#C7D4F0] bg-white text-base font-semibold text-[#2F55B7] hover:bg-[#EEF4FF] sm:w-auto",
);

export function HeroSection() {
  return (
    <section className="bg-gradient-to-br from-[#EEF4FF] via-[#F4F7FF] to-white py-12 lg:py-20">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        {/* md: — двухколоночная с телефонами справа */}
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-8 lg:gap-12">

          {/* Левая колонка — текст */}
          <div className="flex flex-col items-start">
            <Badge
              variant="outline"
              className="mb-5 rounded-full border-[#B7C4E8] bg-[#EEF4FF] px-3 py-1 text-xs font-medium text-[#2F55B7]"
            >
              Пациентский кабинет
            </Badge>

            <h1 className="text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.03em] text-[#17264A] sm:text-[2.4rem] lg:text-[3rem] lg:leading-[1.05] lg:tracking-[-0.04em]">
              BersonCare — ваш кабинет восстановления
            </h1>

            <p className="mt-4 text-base leading-[1.75] text-[#667085]">
              Программа реабилитации, разминки, напоминания, дневник самочувствия и запись на приём — в одном приложении.
            </p>

            <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href={LANDING_INSTALL_HASH} className={primaryCta}>
                Установить приложение
              </Link>
              <Link href="#features" className={secondaryCta}>
                Узнать больше
              </Link>
            </div>

            <p className="mt-5 flex items-start gap-2 text-sm leading-6 text-[#98A2B3]">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>Работает как PWA: открывается в браузере и устанавливается на экран телефона без App Store.</span>
            </p>
          </div>

          {/* Правая колонка — телефоны */}
          <div className="relative flex items-center justify-center md:justify-end">
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
              sizes="(max-width: 768px) 92vw, (max-width: 1024px) 46vw, 560px"
              className="relative h-auto w-full max-w-[500px] drop-shadow-2xl md:max-w-none"
            />
          </div>

        </div>
      </div>
    </section>
  );
}
