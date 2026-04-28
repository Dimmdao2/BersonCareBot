"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { routePaths } from "@/app-layer/routes/paths";
import type { PatientMoodToday } from "@/modules/patient-mood/types";
import type { PatientHomeMoodIconOption } from "@/modules/patient-home/patientHomeMoodIcons";
import { patientHomeCardClass } from "./patientHomeCardStyles";
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
    <section aria-labelledby="patient-home-mood-heading">
      <h2 id="patient-home-mood-heading" className="mb-2 text-base font-semibold">
        Как вы себя чувствуете?
      </h2>
      <div className={patientHomeCardClass}>
        {anonymousGuest ?
          <p className="text-sm text-muted-foreground">
            <Link href={appLoginWithNextHref(routePaths.patient)} className="font-medium text-primary underline-offset-4 hover:underline">
              Войдите
            </Link>
            , чтобы отмечать самочувствие.
          </p>
        : !personalTierOk ?
          <p className="text-sm text-muted-foreground">Чек-ин самочувствия будет доступен после активации профиля.</p>
        : <div className="space-y-3">
            <div className="flex items-center gap-2" role="group" aria-label="Оценка самочувствия">
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
                      "flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border text-xl transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                      active ?
                        "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-background hover:border-primary/60 hover:bg-muted",
                      submittingScore !== null && "cursor-not-allowed opacity-70",
                    )}
                    onClick={() => void saveScore(option.score)}
                  >
                    {option.imageUrl ?
                      // eslint-disable-next-line @next/next/no-img-element -- CMS URL
                      <img src={option.imageUrl} alt="" className="h-full w-full object-cover" />
                    : <span aria-hidden="true">{option.emoji}</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
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
