import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";
import {
  landingContainer,
  landingCtaPrimary,
  landingCtaSecondary,
  landingH1,
  landingLead,
} from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

const trustPoints = [
  "Без App Store и Google Play",
  "Бесплатно, без подписок и рекламы",
  "Открывается с экрана телефона в один клик",
] as const;

export function HeroSection() {
  return (
    <section className="relative overflow-x-hidden bg-gradient-to-br from-[#EEF4FF] via-[#F4F7FF] to-white py-12 sm:py-14 lg:py-24">
      <div
        className="pointer-events-none absolute -top-24 right-[-10%] hidden h-[420px] w-[420px] rounded-full bg-[#2F55B7]/[0.08] blur-3xl md:block"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-[-30%] left-[-15%] hidden h-[420px] w-[420px] rounded-full bg-[#5A78D6]/[0.08] blur-3xl md:block"
        aria-hidden
      />

      <div className={cn("relative", landingContainer)}>
        <div className="grid min-w-0 items-center gap-10 md:grid-cols-2 md:gap-10 lg:gap-16">
          <div className="flex min-w-0 flex-col items-stretch">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D5DEF1] bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#2F55B7] backdrop-blur sm:text-[0.8125rem]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2F55B7]" aria-hidden />
              Кабинет пациента
            </span>

            <h1 className={cn(landingH1, "mt-4")}>
              Восстановление, которое всегда под рукой
            </h1>

            <p className={cn(landingLead, "mt-4 max-w-xl")}>
              Программа реабилитации, разминки, дневник самочувствия и напоминания —
              в одном приложении на вашем телефоне.
            </p>

            <ul className="mt-6 flex flex-col gap-2.5">
              {trustPoints.map((text) => (
                <li
                  key={text}
                  className="flex items-start gap-2.5 text-[0.9375rem] font-medium leading-6 text-[#17264A] sm:text-base"
                >
                  <span
                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#ECFDF3] text-[#17A56B]"
                    aria-hidden
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span className="min-w-0">{text}</span>
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link href={LANDING_INSTALL_HASH} className={landingCtaPrimary}>
                Установить приложение
              </Link>
              <Link href={LANDING_INSTALL_HASH} className={landingCtaSecondary}>
                Как установить
              </Link>
            </div>

            <div className="mx-auto mt-10 w-full max-w-[260px] md:hidden">
              <Image
                src="/images/landing/hero-phones.png"
                alt=""
                width={522}
                height={515}
                priority
                sizes="260px"
                className="mx-auto h-auto w-full max-w-[260px] drop-shadow-xl"
              />
            </div>
          </div>

          <div className="relative hidden min-w-0 items-center justify-end md:flex">
            <div
              className="pointer-events-none absolute inset-[6%] rounded-[40%] bg-[#2F55B7]/10 blur-3xl"
              aria-hidden
            />
            <Image
              src="/images/landing/hero-phones.png"
              alt="Экраны приложения BersonCare"
              width={522}
              height={515}
              priority
              sizes="(max-width: 1024px) 46vw, 520px"
              className="relative h-auto w-full max-w-[440px] drop-shadow-[0_28px_50px_rgba(31,61,120,0.25)] lg:max-w-[520px]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
