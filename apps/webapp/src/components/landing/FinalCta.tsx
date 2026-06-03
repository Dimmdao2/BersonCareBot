import { Smartphone, ShieldCheck, Sparkles } from "lucide-react";
import { landingContainer } from "@/components/landing/landingTypography";

const trustChips = [
  { icon: Smartphone, label: "Без App Store" },
  { icon: Sparkles, label: "Бесплатно" },
  { icon: ShieldCheck, label: "Безопасно" },
] as const;

export function FinalCta() {
  return (
    <section className="overflow-x-hidden bg-white py-12 sm:py-14 lg:py-20">
      <div className={landingContainer}>
        <div className="min-w-0 rounded-[24px] bg-[#2F55B7] px-6 py-8 sm:rounded-[28px] sm:px-10 sm:py-12 lg:px-14 lg:py-14">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-white sm:text-[2rem] lg:text-[2.25rem]">
              Установите BersonCare на телефон
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[1.0625rem] leading-7 text-white/85 sm:mt-4 sm:text-lg">
              Открывается в один клик с экрана — без поиска сайта в браузере.
            </p>

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
