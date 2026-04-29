"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { routePaths } from "@/app-layer/routes/paths";
import type { PatientMoodToday } from "@/modules/patient-mood/types";
import type { PatientHomeMoodIconOption } from "@/modules/patient-home/patientHomeMoodIcons";
import { patientHomeCardGradientWarmClass } from "./patientHomeCardStyles";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { cn } from "@/lib/utils";

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

  return (
    <section
      id="patient-home-mood-checkin"
      className={cn(patientHomeCardGradientWarmClass, "relative min-h-[140px] overflow-hidden")}
      aria-labelledby="patient-home-mood-heading"
    >
      <div className="relative z-[1]">
        <h2 id="patient-home-mood-heading" className="text-lg font-bold text-[var(--patient-text-primary)]">
          Как вы себя чувствуете?
        </h2>
        <p className="mt-1 text-sm text-[var(--patient-text-secondary)]">Отметьте своё состояние одним касанием</p>
        {anonymousGuest ?
          <p className="mt-4 text-sm leading-5 text-[var(--patient-text-secondary)]">
            <Link href={appLoginWithNextHref(routePaths.patient)} className="font-medium text-primary underline-offset-4 hover:underline">
              Войдите
            </Link>
            , чтобы отмечать самочувствие.
          </p>
        : !personalTierOk ?
          <p className="mt-4 text-sm leading-5 text-[var(--patient-text-secondary)]">Чек-ин самочувствия будет доступен после активации профиля.</p>
        : <div className="mt-4 space-y-3">
            <div className="grid grid-cols-5 gap-2" role="group" aria-label="Оценка самочувствия">
              {moodOptions.map((option) => {
                const active = selectedScore === option.score;
                return (
                  <button
                    key={option.score}
                    type="button"
                    aria-label={`Самочувствие ${option.score} из 5: ${option.label}`}
                    aria-pressed={active}
                    disabled={submittingScore !== null}
                    className={cn(
                      "flex min-h-[48px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-transparent bg-white/50 py-2 text-2xl transition-colors",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
                      active ?
                        "border-[var(--patient-color-primary)] bg-[#eef2ff] ring-2 ring-[var(--patient-color-primary)]"
                      : "hover:border-[var(--patient-color-primary)]/40 hover:bg-white/80",
                      submittingScore !== null && "cursor-not-allowed opacity-70",
                    )}
                    onClick={() => void saveScore(option.score)}
                  >
                    {option.imageUrl ?
                      // eslint-disable-next-line @next/next/no-img-element -- CMS URL
                      <img src={option.imageUrl} alt="" className="size-10 rounded-full object-contain" loading="lazy" />
                    : <span aria-hidden="true" className="leading-none">{option.emoji}</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-sm leading-5 text-[var(--patient-text-secondary)]" aria-live="polite">
              {submittingScore !== null ?
                "Сохраняем..."
              : savedScore && selectedScore !== null ?
                <>
                  Записано.{" "}
                  <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => setSelectedScore(null)}>
                    Изменить
                  </button>
                </>
              : "Выберите оценку от 1 до 5."}
            </p>
          </div>}
      </div>
    </section>
  );
}
