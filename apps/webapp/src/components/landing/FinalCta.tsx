import { Smartphone, ShieldCheck, Sparkles } from "lucide-react";
import { landingContainer } from "@/components/landing/landingTypography";

const trustChips = [
  { icon: ShieldCheck, label: "Для восстановления" },
  { icon: Sparkles, label: "Для ежедневной заботы" },
  { icon: Smartphone, label: "Всегда под рукой" },
] as const;

export function FinalCta() {
  return (
    <section className="overflow-x-hidden bg-white py-12 sm:py-14 lg:py-20">
      <div className={landingContainer}>
        <div className="min-w-0 rounded-[24px] bg-[#2F55B7] px-6 py-8 sm:rounded-[28px] sm:px-10 sm:py-12 lg:px-14 lg:py-14">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-white sm:text-[2rem] lg:text-[2.25rem]">
              Забота о теле без лишней сложности
            </h2>
            <p className="mx-auto mt-3 flex max-w-xl flex-col gap-2 text-[1.0625rem] font-normal leading-7 text-white/80 sm:mt-4 sm:text-lg">
              <span>
                BersonCare задумывался как приложение для сопровождения клиентов в реабилитации
                и на пути к оздоровлению.
              </span>
              <span>
                Со временем он вырос в простой и полезный продукт для всех, кто хочет двигаться
                регулярно, безопасно и с понятной опорой.
              </span>
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
