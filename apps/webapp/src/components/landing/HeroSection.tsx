import Image from "next/image";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";
import {
  landingBody,
  landingCaption,
  landingContainer,
  landingCtaPrimary,
  landingH1,
} from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

export function HeroSection() {
  return (
    <section className="overflow-x-hidden bg-gradient-to-br from-[#EEF4FF] via-[#F4F7FF] to-white py-10 sm:py-12 lg:py-20">
      <div className={landingContainer}>
        <div className="grid min-w-0 items-center gap-8 md:grid-cols-2 md:gap-10 lg:gap-12">
          <div className="flex min-w-0 flex-col items-stretch">
            <h1 className={landingH1}>BersonCare — приложение для восстановления</h1>

            <p className={cn(landingBody, "mt-4")}>
              Установите BersonCare на телефон: программа, разминки, дневник и напоминания будут открываться в один
              клик.
            </p>

            <div className="mt-6">
              <Link href={LANDING_INSTALL_HASH} className={landingCtaPrimary}>
                Установить приложение
              </Link>
            </div>

            <p className={cn("mt-4 flex min-w-0 items-start gap-2", landingCaption)}>
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">Устанавливается без App Store и Google Play.</span>
            </p>

            <div className="mx-auto mt-6 w-full max-w-[260px] md:hidden">
              <Image
                src="/images/landing/hero-phones.png"
                alt=""
                width={522}
                height={515}
                priority
                sizes="260px"
                className="mx-auto h-auto w-full max-w-[260px] opacity-95 drop-shadow-lg"
              />
            </div>
          </div>

          <div className="relative hidden min-w-0 items-center justify-end md:flex">
            <div
              className="pointer-events-none absolute inset-[8%] rounded-full bg-[#2F55B7]/[0.06] blur-3xl"
              aria-hidden
            />
            <Image
              src="/images/landing/hero-phones.png"
              alt="Экраны приложения BersonCare"
              width={522}
              height={515}
              priority
              sizes="(max-width: 1024px) 46vw, 480px"
              className="relative h-auto w-full max-w-[420px] drop-shadow-2xl lg:max-w-[480px]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
