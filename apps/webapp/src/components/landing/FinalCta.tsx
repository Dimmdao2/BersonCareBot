import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { LANDING_BOOKING_HREF, LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";

export function FinalCta() {
  return (
    <section className="bg-[#F8FAFF] py-16 lg:py-20">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <div className="overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1E3F9C] via-[#2F55B7] to-[#5A78D6] px-7 py-10 shadow-[0_20px_60px_rgba(31,61,120,0.20)] sm:px-10 sm:py-12 lg:rounded-[28px]">
          {/* md: — текст слева, кнопки справа */}
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center md:gap-12">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
                Начните восстановление с понятного плана
              </h2>
              <p className="mt-4 max-w-lg text-base leading-7 text-white/80">
                Установите приложение, выполняйте назначенные упражнения, отмечайте самочувствие и возвращайтесь к программе без поиска сообщений и файлов.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row md:flex-col md:min-w-[200px]">
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
                className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-white/25 bg-transparent px-4 text-base font-semibold text-white transition-colors hover:bg-white/15"
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
