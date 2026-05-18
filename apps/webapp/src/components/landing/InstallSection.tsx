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
    <section id="install" className="bg-[#F8FAFF] py-14 lg:py-16">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <h2 className="text-center text-2xl font-semibold tracking-[-0.03em] text-[#17264A] sm:text-3xl">
          Как установить BersonCare
        </h2>

        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-[1fr_1fr_220px] lg:items-start">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[#17264A]">
              <Apple className="h-4 w-4 text-[#667085]" aria-hidden />
              <h3 className="text-base font-semibold">Для iPhone (Safari)</h3>
            </div>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-6 text-[#667085]">
              {stepsIos.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[#17264A]">
              <Smartphone className="h-4 w-4 text-[#667085]" aria-hidden />
              <h3 className="text-base font-semibold">Для Android (Chrome)</h3>
            </div>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-6 text-[#667085]">
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
