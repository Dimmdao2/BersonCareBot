"use client";

import Link from "next/link";
import { Angry, Frown, Laugh, Meh, Smile } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { routePaths } from "@/app-layer/routes/paths";
import type { PatientMoodToday } from "@/modules/patient-mood/types";
import type { PatientHomeMoodIconOption } from "@/modules/patient-home/patientHomeMoodIcons";
import {
  patientHomeBlockBodySmClass,
  patientHomeBlockHeadingClass,
  patientHomeCardGradientWarmClass,
  patientHomeMoodCardGeometryClass,
  patientHomeMoodOptionButtonClass,
  patientHomeMoodStatusSlotClass,
} from "./patientHomeCardStyles";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { cn } from "@/lib/utils";

const MOOD_SCORE_ICONS = {
  1: Angry,
  2: Frown,
  3: Meh,
  4: Smile,
  5: Laugh,
} as const;

const MOOD_SCORE_ICON_CLASS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "text-red-600",
  2: "text-orange-600",
  3: "text-amber-500",
  4: "text-lime-600",
  5: "text-green-600",
};

/** Hover/active border в цвет иконки (полные строки для Tailwind JIT). */
const MOOD_SCORE_CONTAINER_ACTIVE: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "border-red-600 bg-red-50/90 ring-2 ring-red-600/25",
  2: "border-orange-600 bg-orange-50/90 ring-2 ring-orange-600/25",
  3: "border-amber-500 bg-amber-50/90 ring-2 ring-amber-500/25",
  4: "border-lime-600 bg-lime-50/90 ring-2 ring-lime-600/25",
  5: "border-green-600 bg-green-50/90 ring-2 ring-green-600/25",
};

const MOOD_SCORE_CONTAINER_HOVER: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "hover:border-red-600 hover:bg-white/90",
  2: "hover:border-orange-600 hover:bg-white/90",
  3: "hover:border-amber-500 hover:bg-white/90",
  4: "hover:border-lime-600 hover:bg-white/90",
  5: "hover:border-green-600 hover:bg-white/90",
};

type Props = {
  moodOptions: readonly PatientHomeMoodIconOption[];
  personalTierOk: boolean;
  anonymousGuest: boolean;
  initialMood?: PatientMoodToday | null;
};

export function PatientHomeMoodCheckin({
  moodOptions,
  personalTierOk,
  anonymousGuest,
  initialMood = null,
}: Props) {
  const router = useRouter();
  const [selectedScore, setSelectedScore] = useState<number | null>(initialMood?.score ?? null);
  const [savedScore, setSavedScore] = useState<number | null>(initialMood?.score ?? null);
  const [submittingScore, setSubmittingScore] = useState<number | null>(null);

  async function saveScore(score: number) {
    const previousSelected = selectedScore;
    const previousSaved = savedScore;
    setSelectedScore(score);
    setSubmittingScore(score);
    try {
      const res = await fetch("/api/patient/mood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        mood?: PatientMoodToday;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.mood) {
        setSelectedScore(previousSelected);
        setSavedScore(previousSaved);
        toast.error("Не удалось сохранить, попробуйте позже.");
        return;
      }
      setSelectedScore(data.mood.score);
      setSavedScore(data.mood.score);
      router.refresh();
    } catch {
      setSelectedScore(previousSelected);
      setSavedScore(previousSaved);
      toast.error("Не удалось сохранить, попробуйте позже.");
    } finally {
      setSubmittingScore(null);
    }
  }

  const statusLine =
    submittingScore !== null ?
      "Сохраняем..."
    : savedScore !== null && selectedScore !== null ?
      <>
        Записано.{" "}
        <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => setSelectedScore(null)}>
          Изменить
        </button>
      </>
    : "Выберите оценку от 1 до 5.";

  const renderMoodScale = (disabled: boolean) => (
    <div className="grid min-h-[4rem] flex-1 grid-cols-5 items-start gap-2" role="group" aria-label="Оценка самочувствия">
      {moodOptions.map((option) => {
        const active = selectedScore === option.score;
        const MoodIcon = MOOD_SCORE_ICONS[option.score];
        return (
          <div key={option.score} className="flex min-w-0 flex-col items-center gap-1">
            <button
              type="button"
              aria-label={`Самочувствие ${option.score} из 5: ${option.label}`}
              aria-pressed={active}
              disabled={disabled || submittingScore !== null}
              className={cn(
                patientHomeMoodOptionButtonClass,
                active ? MOOD_SCORE_CONTAINER_ACTIVE[option.score] : MOOD_SCORE_CONTAINER_HOVER[option.score],
                (disabled || submittingScore !== null) && "cursor-not-allowed opacity-70",
              )}
              onClick={() => void saveScore(option.score)}
            >
              <PatientHomeSafeImage
                src={disabled ? null : option.imageUrl}
                alt=""
                className="size-8 rounded-full object-cover sm:size-9"
                loading="lazy"
                fallback={
                  <MoodIcon
                    aria-hidden
                    className={cn("size-8 shrink-0 sm:size-9", MOOD_SCORE_ICON_CLASS[option.score])}
                    strokeWidth={1.25}
                  />
                }
              />
            </button>
            <span className="text-xs font-semibold leading-none text-[var(--patient-text-primary)]">{option.score}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <section
      id="patient-home-mood-checkin"
      className={cn(patientHomeCardGradientWarmClass, patientHomeMoodCardGeometryClass, "relative")}
      aria-labelledby="patient-home-mood-heading"
    >
      <div className="relative z-[1] flex h-full min-h-0 flex-col">
        <div className="shrink-0">
          <h2 id="patient-home-mood-heading" className={patientHomeBlockHeadingClass}>
            Как вы себя чувствуете?
          </h2>
          <p className={cn("mt-1", patientHomeBlockBodySmClass)}>Отметьте своё состояние одним касанием</p>
        </div>
        {anonymousGuest ?
          <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 pt-3">
            {renderMoodScale(true)}
            <p className={patientHomeMoodStatusSlotClass}>
              <Link href={appLoginWithNextHref(routePaths.patient)} className="font-medium text-primary underline-offset-4 hover:underline">
                Войдите
              </Link>
              , чтобы отмечать самочувствие.
            </p>
          </div>
        : !personalTierOk ?
          <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 pt-3">
            {renderMoodScale(true)}
            <p className={patientHomeMoodStatusSlotClass}>Чек-ин самочувствия будет доступен после активации профиля.</p>
          </div>
        : <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 pt-3">
            {renderMoodScale(false)}
            <p className={patientHomeMoodStatusSlotClass} aria-live="polite">
              {statusLine}
            </p>
          </div>}
      </div>
    </section>
  );
}
