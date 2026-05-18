import Image from "next/image";
import { Apple, Smartphone } from "lucide-react";
import { PhoneMockup } from "@/components/landing/PhoneMockup";

const stepsIos = [
  "Откройте сайт в Safari.",
  "Нажмите «Поделиться».",
  "Выберите «На экран Домой».",
  "Откройте приложение как обычную иконку.",
] as const;

const stepsAndroid = [
  "Откройте сайт в Chrome.",
  "Нажмите меню.",
  "Выберите «Установить приложение» или «Добавить на главный экран».",
] as const;

export function InstallSection() {
  return (
    <section id="install" className="bg-[#F8FAFF] py-10 lg:py-16">
      <div className="mx-auto max-w-full px-4 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <h2 className="text-center text-lg font-semibold tracking-[-0.02em] text-[#17264A] max-[439px]:text-base sm:text-3xl">
          Как установить BersonCare
        </h2>

        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:mt-8 lg:gap-6 lg:grid-cols-[1fr_1fr_220px] lg:items-start">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[#17264A]">
              <Apple className="h-4 w-4 text-[#667085]" aria-hidden />
              <h3 className="text-xs font-semibold max-[439px]:text-[11px] sm:text-base">Для iPhone (Safari)</h3>
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-xs leading-5 text-[#667085] sm:space-y-1.5 sm:text-sm sm:leading-6">
              {stepsIos.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[#17264A]">
              <Smartphone className="h-4 w-4 text-[#667085]" aria-hidden />
              <h3 className="text-xs font-semibold max-[439px]:text-[11px] sm:text-base">Для Android (Chrome)</h3>
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-xs leading-5 text-[#667085] sm:space-y-1.5 sm:text-sm sm:leading-6">
              {stepsAndroid.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>

          <div className="hidden lg:block">
            <PhoneMockup className="mx-auto w-full max-w-[190px]">
              <div className="flex aspect-[9/16] flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#EEF4FF] to-white p-6">
                <div className="relative h-16 w-16 overflow-hidden rounded-[18px] shadow-md ring-1 ring-black/5">
                  <Image src="/pwa-icon-192.png" alt="Иконка BersonCare" width={64} height={64} className="h-full w-full object-cover" />
                </div>
              </div>
            </PhoneMockup>
          </div>
        </div>
      </div>
    </section>
  );
}
