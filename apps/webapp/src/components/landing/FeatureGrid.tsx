import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bell,
  ClipboardList,
  Dumbbell,
  HeartPulse,
  PlayCircle,
} from "lucide-react";
import {
  landingBodySecondary,
  landingContainer,
  landingH2,
  landingStepTitle,
} from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

type Tone = "blue" | "green" | "orange" | "violet" | "teal" | "rose";

const toneClass: Record<Tone, string> = {
  blue: "bg-[#EEF4FF] text-[#2F55B7]",
  green: "bg-[#ECFDF3] text-[#17A56B]",
  orange: "bg-[#FFF6E8] text-[#E8912E]",
  violet: "bg-[#F1ECFE] text-[#6B46C1]",
  teal: "bg-[#E6FAF7] text-[#0E9384]",
  rose: "bg-[#FFEFF2] text-[#C8385C]",
};

const features: ReadonlyArray<{ title: string; description: string; icon: LucideIcon; tone: Tone }> = [
  {
    title: "Разминки",
    description: "Короткие комплексы на каждый день для шеи, спины и плеч.",
    icon: Activity,
    tone: "green",
  },
  {
    title: "Тренировки и упражнения",
    description: "Подобраны под вашу задачу: осанка, поясница, суставы.",
    icon: Dumbbell,
    tone: "blue",
  },
  {
    title: "Программа реабилитации",
    description: "Персональный план от специалиста с отметками выполнения.",
    icon: ClipboardList,
    tone: "violet",
  },
  {
    title: "Видео к упражнениям",
    description: "Каждое движение с понятным видео — чтобы делать правильно.",
    icon: PlayCircle,
    tone: "rose",
  },
  {
    title: "Дневник самочувствия",
    description: "Отмечайте состояние и следите за динамикой по неделям.",
    icon: HeartPulse,
    tone: "orange",
  },
  {
    title: "Напоминания",
    description: "Мягко подсказывают о занятиях, чтобы не бросить на полпути.",
    icon: Bell,
    tone: "teal",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-[80px] overflow-x-hidden bg-white py-12 sm:py-14 lg:py-20">
      <div className={landingContainer}>
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2F55B7] sm:text-[0.8125rem]">
            Возможности
          </p>
          <h2 className={cn(landingH2, "mt-2")}>Всё для занятий в одном приложении</h2>
        </div>

        <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
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
