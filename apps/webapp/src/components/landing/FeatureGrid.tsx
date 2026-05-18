import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bell,
  CalendarPlus,
  ClipboardList,
  LineChart,
  PlaySquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "blue" | "green" | "orange" | "purple";

const toneClass: Record<Tone, string> = {
  blue: "bg-[#EEF4FF] text-[#2F55B7]",
  green: "bg-[#ECFDF3] text-[#17A56B]",
  orange: "bg-[#FFF6E8] text-[#E8912E]",
  purple: "bg-[#F3F0FF] text-[#7A5AF8]",
};

const features: ReadonlyArray<{
  title: string;
  description: string;
  icon: LucideIcon;
  tone: Tone;
}> = [
  {
    title: "Программа реабилитации",
    description: "Индивидуальный план упражнений, видеоинструкции и отметки выполнения.",
    icon: ClipboardList,
    tone: "blue",
  },
  {
    title: "Разминки дня",
    description: "Короткие безопасные разминки для шеи, спины, плеч и общего восстановления.",
    icon: Activity,
    tone: "green",
  },
  {
    title: "Дневник самочувствия",
    description: "Оценка состояния, симптомы и динамика за неделю в удобном графике.",
    icon: LineChart,
    tone: "orange",
  },
  {
    title: "Напоминания",
    description: "Приложение помогает не забывать о разминках, программе реабилитации и важных действиях.",
    icon: Bell,
    tone: "blue",
  },
  {
    title: "Запись на приём",
    description: "Очные и онлайн-консультации, выбор услуги и удобного времени.",
    icon: CalendarPlus,
    tone: "green",
  },
  {
    title: "Материалы и видео",
    description: "Полезные статьи, уроки и видео в одном пациентском кабинете.",
    icon: PlaySquare,
    tone: "purple",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-20 bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17264A] sm:text-3xl lg:text-[2.5rem]">
            Всё, что нужно для восстановления
          </h2>
        </div>

        {/* mobile: 2 колонки; md+: 3 колонки */}
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="flex flex-col rounded-2xl border border-[#DDE3F0] bg-white p-4 shadow-sm sm:p-5"
              >
                <div
                  className={cn(
                    "mb-3 flex h-11 w-11 items-center justify-center rounded-2xl sm:h-12 sm:w-12",
                    toneClass[f.tone],
                  )}
                >
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
                </div>
                <h3 className="text-sm font-semibold leading-snug text-[#17264A] sm:text-base">{f.title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-[#667085] sm:mt-2 sm:text-sm sm:leading-6">
                  {f.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
