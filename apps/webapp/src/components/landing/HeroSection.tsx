import Image from "next/image";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { LANDING_BOOKING_HREF, LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";

const primaryCta = cn(
  buttonVariants({ size: "lg" }),
  "w-full rounded-xl bg-[#2F55B7] text-white hover:bg-[#2448A5] sm:w-auto",
);

const secondaryCta = cn(
  buttonVariants({ size: "lg", variant: "outline" }),
  "w-full rounded-xl border-[#B7C4E8] bg-white text-[#2F55B7] hover:bg-[#EEF4FF] sm:w-auto",
);

export function HeroSection() {
  return (
    <section className="py-12 lg:py-20">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <div className="overflow-hidden rounded-[28px] border border-[#DDE3F0] bg-gradient-to-br from-[#F8FAFF] via-[#EEF4FF] to-white p-6 shadow-[0_24px_80px_rgba(31,61,120,0.10)] sm:p-8 lg:rounded-[32px] lg:p-10">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
            <div>
              <Badge
                variant="outline"
                className="mb-4 rounded-full border-[#B7C4E8] bg-[#EEF4FF] px-3 py-1 text-xs font-medium text-[#2F55B7]"
              >
                Пациентский кабинет
              </Badge>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[#17264A] sm:text-5xl sm:leading-[1.05] lg:text-6xl lg:leading-[1.02] lg:tracking-[-0.05em]">
                BersonCare — ваш кабинет восстановления
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#667085]">
                Программа реабилитации, разминки, напоминания, дневник самочувствия и запись на приём — в одном
                приложении.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link href={LANDING_INSTALL_HASH} className={primaryCta}>
                  Установить приложение
                </Link>
                <Link href={LANDING_BOOKING_HREF} className={secondaryCta}>
                  Записаться на консультацию
                </Link>
              </div>
              <p className="mt-5 flex gap-2 text-sm leading-6 text-[#667085]">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[#98A2B3]" aria-hidden />
                <span>
                  Работает как PWA: открывается в браузере и устанавливается на экран телефона без App Store.
                </span>
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-[min(100%,420px)] lg:max-w-none">
              <Image
                src="/images/landing/hero-phones.png"
                alt="Экраны приложения BersonCare: программа, главная, дневник"
                width={1200}
                height={900}
                priority
                sizes="(max-width: 1024px) 85vw, 520px"
                className="h-auto w-full rounded-[24px] shadow-[0_24px_80px_rgba(31,61,120,0.18)] sm:rounded-[32px]"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
