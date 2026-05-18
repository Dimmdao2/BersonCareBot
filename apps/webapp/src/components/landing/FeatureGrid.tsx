import type { LucideIcon } from "lucide-react";
import { Activity, Bell, CalendarPlus, ClipboardList, LineChart, PlaySquare } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "blue" | "green" | "orange" | "purple";

const toneClass: Record<Tone, string> = {
  blue: "bg-[#EEF4FF] text-[#2F55B7]",
  green: "bg-[#ECFDF3] text-[#17A56B]",
  orange: "bg-[#FFF6E8] text-[#E8912E]",
  purple: "bg-[#F3F0FF] text-[#7A5AF8]",
};

const features: ReadonlyArray<{ title: string; description: string; icon: LucideIcon; tone: Tone }> = [
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
    tone: "purple",
  },
  {
    title: "Материалы и видео",
    description: "Полезные статьи, уроки и видео в одном пациентском кабинете.",
    icon: PlaySquare,
    tone: "orange",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="bg-[#F8FAFF] py-10 lg:py-16">
      <div className="mx-auto max-w-full px-4 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <h2 className="text-center text-lg font-semibold tracking-[-0.02em] text-[#17264A] max-[439px]:text-base sm:text-3xl">
          Всё, что нужно для восстановления
        </h2>

        <div className="mt-7 grid grid-cols-2 gap-x-4 gap-y-6 lg:mt-10 lg:gap-x-6 lg:gap-y-8 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="text-center">
                <div className={cn("mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-2xl sm:mb-3 sm:h-12 sm:w-12", toneClass[f.tone])}>
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                </div>
                <h3 className="text-[11px] font-semibold text-[#17264A] max-[439px]:text-[10px] sm:text-base">{f.title}</h3>
                <p className="mx-auto mt-1.5 max-w-[17rem] text-[10px] leading-4 text-[#667085] sm:mt-2 sm:text-sm sm:leading-6">{f.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
