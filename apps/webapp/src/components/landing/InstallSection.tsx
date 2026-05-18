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
  "Нажмите меню (⋮).",
  "Выберите «Установить приложение» или «Добавить на главный экран».",
] as const;

export function InstallSection() {
  return (
    <section id="install" className="scroll-mt-20 bg-[#F8FAFF] py-16 lg:py-24">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">

        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17264A] sm:text-3xl lg:text-[2.5rem]">
            Как установить BersonCare
          </h2>
          <p className="mt-3 text-base leading-7 text-[#667085]">
            Приложение устанавливается на экран телефона и открывается как обычное приложение.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_220px] lg:items-start">

          <div className="rounded-2xl border border-[#DDE3F0] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2.5">
              <Apple className="h-5 w-5 text-[#667085]" aria-hidden />
              <h3 className="text-base font-semibold text-[#17264A]">Для iPhone (Safari)</h3>
            </div>
            <ol className="space-y-2.5 pl-5 text-sm leading-6 text-[#667085]" style={{ listStyleType: "decimal" }}>
              {stepsIos.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-[#DDE3F0] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2.5">
              <Smartphone className="h-5 w-5 text-[#667085]" aria-hidden />
              <h3 className="text-base font-semibold text-[#17264A]">Для Android (Chrome)</h3>
            </div>
            <ol className="space-y-2.5 pl-5 text-sm leading-6 text-[#667085]" style={{ listStyleType: "decimal" }}>
              {stepsAndroid.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>

          <div className="mx-auto w-full max-w-[200px] sm:col-span-2 sm:max-w-[180px] lg:col-span-1 lg:mx-0 lg:max-w-none">
            <PhoneMockup>
              <div className="flex aspect-[9/16] flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#EEF4FF] to-white p-6">
                <div className="relative h-20 w-20 overflow-hidden rounded-[22px] shadow-md ring-1 ring-black/5">
                  <Image
                    src="/pwa-icon-192.png"
                    alt="Иконка BersonCare"
                    width={80}
                    height={80}
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="text-center text-xs font-medium text-[#667085]">Ярлык на главном экране</p>
              </div>
            </PhoneMockup>
          </div>

        </div>
      </div>
    </section>
  );
}
