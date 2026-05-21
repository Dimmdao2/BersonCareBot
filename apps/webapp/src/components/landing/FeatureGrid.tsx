import type { LucideIcon } from "lucide-react";
import { Activity, Bell, ClipboardList, LineChart } from "lucide-react";
import {
  landingBodySecondary,
  landingContainer,
  landingH2,
  landingStepTitle,
} from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

type Tone = "blue" | "green" | "orange";

const toneClass: Record<Tone, string> = {
  blue: "bg-[#EEF4FF] text-[#2F55B7]",
  green: "bg-[#ECFDF3] text-[#17A56B]",
  orange: "bg-[#FFF6E8] text-[#E8912E]",
};

const features: ReadonlyArray<{ title: string; description: string; icon: LucideIcon; tone: Tone }> = [
  {
    title: "Программа восстановления",
    description: "Упражнения, видео и отметки выполнения.",
    icon: ClipboardList,
    tone: "blue",
  },
  {
    title: "Разминки",
    description: "Короткие комплексы для шеи, спины и плеч.",
    icon: Activity,
    tone: "green",
  },
  {
    title: "Дневник самочувствия",
    description: "Симптомы, состояние и динамика.",
    icon: LineChart,
    tone: "orange",
  },
  {
    title: "Напоминания",
    description: "Чтобы не забывать о занятиях.",
    icon: Bell,
    tone: "blue",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="overflow-x-hidden bg-white py-8 sm:py-10 lg:py-12">
      <div className={landingContainer}>
        <h2 className={cn(landingH2, "text-center")}>Что будет в приложении</h2>

        <div className="mt-5 flex flex-col gap-3 sm:mt-6">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="flex min-w-0 items-start gap-3 rounded-[18px] border border-[#E6ECF8] bg-white p-4"
              >
                <div
                  className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", toneClass[f.tone])}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className={landingStepTitle}>{f.title}</h3>
                  <p className={cn(landingBodySecondary, "mt-0.5")}>{f.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
