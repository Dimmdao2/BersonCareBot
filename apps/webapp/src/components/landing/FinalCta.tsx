import Link from "next/link";
import { Smartphone, ShieldCheck, Sparkles } from "lucide-react";
import { LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";
import {
  landingContainer,
  landingCtaPrimary,
} from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

const trustChips = [
  { icon: Smartphone, label: "Без App Store" },
  { icon: Sparkles, label: "Бесплатно" },
  { icon: ShieldCheck, label: "Безопасно" },
] as const;

export function FinalCta() {
  return (
    <section className="overflow-x-hidden bg-white py-12 sm:py-14 lg:py-20">
      <div className={landingContainer}>
        <div className="relative min-w-0 overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1E3F9C] via-[#2F55B7] to-[#5A78D6] px-6 py-8 shadow-[0_24px_60px_rgba(31,61,120,0.28)] sm:rounded-[28px] sm:px-10 sm:py-12 lg:px-14 lg:py-14">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/10 blur-3xl"
            aria-hidden
          />

          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-white sm:text-[2rem] lg:text-[2.25rem]">
              Установите BersonCare на телефон
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[1.0625rem] leading-7 text-white/85 sm:mt-4 sm:text-lg">
              Открывается в один клик с экрана — без поиска сайта в браузере.
            </p>

            <div className="mt-6 flex justify-center sm:mt-7">
              <Link
                href={LANDING_INSTALL_HASH}
                className={cn(
                  landingCtaPrimary,
                  "max-w-xs bg-white text-[#2F55B7] shadow-[0_10px_28px_rgba(0,0,0,0.18)] hover:bg-white/95 hover:text-[#2448A5] hover:shadow-[0_14px_36px_rgba(0,0,0,0.22)]",
                )}
              >
                Установить приложение
              </Link>
            </div>

            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:mt-7 sm:gap-x-6">
              {trustChips.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-white/90 sm:text-[0.9375rem]"
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
