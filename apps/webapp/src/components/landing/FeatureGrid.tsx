import type { LucideIcon } from "lucide-react";
import { Activity, Bell, ClipboardList, LineChart } from "lucide-react";
import {
  landingBodySecondary,
  landingContainer,
  landingH2,
  landingStepTitle,
} from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

type Tone = "blue" | "green" | "orange" | "violet";

const toneClass: Record<Tone, string> = {
  blue: "bg-[#EEF4FF] text-[#2F55B7]",
  green: "bg-[#ECFDF3] text-[#17A56B]",
  orange: "bg-[#FFF6E8] text-[#E8912E]",
  violet: "bg-[#F1ECFE] text-[#6B46C1]",
};

const features: ReadonlyArray<{ title: string; description: string; icon: LucideIcon; tone: Tone }> = [
  {
    title: "Программа восстановления",
    description: "Упражнения, видео и отметки выполнения по дням.",
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
    description: "Симптомы, состояние и динамика по неделям.",
    icon: LineChart,
    tone: "orange",
  },
  {
    title: "Напоминания",
    description: "Чтобы не забывать о занятиях и записях.",
    icon: Bell,
    tone: "violet",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="overflow-x-hidden bg-white py-12 sm:py-14 lg:py-20">
      <div className={landingContainer}>
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2F55B7] sm:text-[0.8125rem]">
            Что внутри
          </p>
          <h2 className={cn(landingH2, "mt-2")}>Что будет в приложении</h2>
        </div>

        <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className={cn(
                  "group flex min-w-0 items-start gap-4 rounded-2xl border border-[#E6ECF8] bg-white p-5",
                  "transition hover:-translate-y-0.5 hover:border-[#C8D3EC]",
                  "sm:p-6",
                )}
              >
                <div
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition group-hover:scale-105",
                    toneClass[f.tone],
                  )}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className={landingStepTitle}>{f.title}</h3>
                  <p className={cn(landingBodySecondary, "mt-1")}>{f.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
