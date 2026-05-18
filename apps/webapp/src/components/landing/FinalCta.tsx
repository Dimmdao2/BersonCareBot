import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { LANDING_BOOKING_HREF, LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";

export function FinalCta() {
  return (
    <section className="py-16 lg:py-24">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <div className="rounded-[28px] bg-gradient-to-br from-[#2F55B7] to-[#5A78D6] px-8 py-10 text-white shadow-[0_16px_50px_rgba(31,61,120,0.15)] sm:px-10 sm:py-12 lg:rounded-[32px]">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl lg:text-[2.5rem] lg:leading-[1.15]">
                Начните восстановление с понятного плана
              </h2>
              <p className="mt-4 max-w-lg text-base leading-7 text-white/85">
                Установите приложение, выполняйте назначенные упражнения, отмечайте самочувствие и
                возвращайтесь к программе без поиска сообщений и файлов.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:max-w-xs lg:ml-auto">
              <Link
                href={LANDING_INSTALL_HASH}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "w-full justify-center rounded-xl bg-white text-base font-semibold text-[#2F55B7] hover:bg-white/90",
                )}
              >
                Установить приложение
              </Link>
              <Link
                href={LANDING_BOOKING_HREF}
                className={cn(
                  "inline-flex h-10 w-full items-center justify-center rounded-xl border border-white/30 bg-white/10 px-4 text-base font-semibold text-white transition-colors hover:bg-white/20",
                )}
              >
                Записаться на консультацию
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
