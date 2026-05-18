import Image from "next/image";
import { Apple, Smartphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
    <section id="install" className="scroll-mt-24 py-12 lg:py-20">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <div className="mx-auto max-w-2xl text-center lg:max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17264A] sm:text-3xl lg:text-4xl">
            Как установить BersonCare
          </h2>
          <p className="mt-3 text-base leading-7 text-[#667085]">
            Приложение устанавливается на экран телефона и открывается как обычное приложение.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1fr_minmax(0,280px)] lg:items-start">
          <Card className="border border-[#DDE3F0] bg-white shadow-sm rounded-2xl">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-[#17264A]">
                <Apple className="h-5 w-5 text-[#667085]" aria-hidden />
                <h3 className="text-lg font-semibold">Для iPhone</h3>
              </div>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[#667085] sm:text-base sm:leading-7">
                {stepsIos.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card className="border border-[#DDE3F0] bg-white shadow-sm rounded-2xl">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-[#17264A]">
                <Smartphone className="h-5 w-5 text-[#667085]" aria-hidden />
                <h3 className="text-lg font-semibold">Для Android</h3>
              </div>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[#667085] sm:text-base sm:leading-7">
                {stepsAndroid.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <div className="mx-auto w-full max-w-[220px] lg:mx-0 lg:justify-self-end">
            <PhoneMockup>
              <div className="relative aspect-[9/16] w-full bg-gradient-to-b from-[#EEF4FF] to-white">
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
                  <div className="relative h-20 w-20 overflow-hidden rounded-[22px] shadow-md ring-1 ring-black/5">
                    <Image src="/pwa-icon-192.png" alt="" width={80} height={80} className="h-full w-full object-cover" />
                  </div>
                  <p className="text-center text-xs font-medium text-[#667085]">Ярлык на главном экране</p>
                </div>
              </div>
            </PhoneMockup>
          </div>
        </div>
      </div>
    </section>
  );
}
