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
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17264A] sm:text-3xl lg:text-[2.5rem]">
            Всё, что нужно для восстановления
          </h2>
          <p className="mt-3 text-base leading-7 text-[#667085]">
            Программа, упражнения, дневник и запись собраны в одном пациентском кабинете.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="flex flex-col rounded-2xl border border-[#DDE3F0] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div
                  className={cn(
                    "mb-4 flex h-12 w-12 items-center justify-center rounded-2xl",
                    toneClass[f.tone],
                  )}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="text-base font-semibold text-[#17264A] sm:text-lg">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#667085]">{f.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
