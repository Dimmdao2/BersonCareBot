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
  "w-full justify-center rounded-xl border-[#B7C4E8] bg-white text-base font-semibold text-[#2F55B7] hover:bg-[#EEF4FF] sm:w-auto",
);

export function HeroSection() {
  return (
    <section className="overflow-hidden bg-gradient-to-br from-[#F0F5FF] via-[#EEF4FF] to-white py-14 lg:py-24">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">

          {/* Left — text */}
          <div className="flex flex-col items-start">
            <Badge
              variant="outline"
              className="mb-5 rounded-full border-[#B7C4E8] bg-[#EEF4FF] px-3 py-1 text-xs font-medium text-[#2F55B7]"
            >
              Пациентский кабинет
            </Badge>

            <h1 className="text-4xl font-semibold leading-[1.07] tracking-[-0.04em] text-[#17264A] sm:text-[2.75rem] lg:text-[3.25rem] lg:leading-[1.04] lg:tracking-[-0.05em]">
              BersonCare — ваш кабинет&nbsp;восстановления
            </h1>

            <p className="mt-4 max-w-lg text-base leading-7 text-[#667085]">
              Программа реабилитации, разминки, напоминания, дневник самочувствия и запись на приём — в одном
              приложении.
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
              <span>Работает как PWA — без App Store, прямо из браузера.</span>
            </p>
          </div>

          {/* Right — phone composite */}
          <div className="relative mx-auto flex w-full items-center justify-center lg:mx-0 lg:justify-end">
            {/* Мягкое свечение за телефонами */}
            <div
              className="pointer-events-none absolute inset-x-[10%] inset-y-[5%] rounded-full bg-[#2F55B7]/10 blur-3xl"
              aria-hidden
            />
            <Image
              src="/images/landing/hero-phones.png"
              alt="Три экрана приложения BersonCare: программа реабилитации, главная и дневник"
              width={522}
              height={515}
              priority
              sizes="(max-width: 1024px) 90vw, 560px"
              className="relative h-auto w-full max-w-[480px] drop-shadow-xl lg:max-w-none"
            />
          </div>

        </div>
      </div>
    </section>
  );
}
