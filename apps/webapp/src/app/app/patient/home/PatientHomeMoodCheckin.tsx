"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { routePaths } from "@/app-layer/routes/paths";
import type {
  PatientMoodIntent,
  PatientMoodLastEntry,
  PatientMoodScore,
  PatientMoodToday,
  PatientMoodWeekDay,
} from "@/modules/patient-mood/types";
import type { PatientHomeMoodIconOption } from "@/modules/patient-home/patientHomeMoodIcons";
import {
  patientHomeMoodCardGeometryClass,
  patientHomeMoodCheckinShellClass,
  patientHomeMoodColumnHeadingClass,
  patientHomeMoodStatusSlotClass,
} from "./patientHomeCardStyles";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { cn } from "@/lib/utils";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { PatientHomeWellbeingWeekStrip } from "./PatientHomeWellbeingWeekStrip";
import { PatientHomeMoodScoreRow } from "./PatientHomeMoodScoreRow";

type Props = {
  moodOptions: readonly PatientHomeMoodIconOption[];
  personalTierOk: boolean;
  anonymousGuest: boolean;
  initialMood?: PatientMoodToday | null;
  initialLastEntry?: PatientMoodLastEntry | null;
  moodWeekDays?: readonly PatientMoodWeekDay[];
  moodWeekPreviousSundayScore?: PatientMoodScore | null;
  moodWeekLastScoreBeforeWeek?: PatientMoodScore | null;
  /** IANA для полосы «Ваша неделя» — те же календарные сутки, что график самочувствия в дневнике. */
  wellbeingWeekTimeZone?: string;
};

export function PatientHomeMoodCheckin({
  moodOptions,
  personalTierOk,
  anonymousGuest,
  initialMood = null,
  initialLastEntry = null,
  moodWeekDays = [],
  moodWeekPreviousSundayScore = null,
  moodWeekLastScoreBeforeWeek = null,
  wellbeingWeekTimeZone = "UTC",
}: Props) {
  const router = useRouter();
  const [selectedScore, setSelectedScore] = useState<number | null>(initialMood?.score ?? null);
  const [savedScore, setSavedScore] = useState<number | null>(initialMood?.score ?? null);
  const [lastEntry, setLastEntry] = useState<PatientMoodLastEntry | null>(initialLastEntry);
  const [submittingScore, setSubmittingScore] = useState<number | null>(null);

  useEffect(() => {
    setSelectedScore(initialMood?.score ?? null);
    setSavedScore(initialMood?.score ?? null);
    setLastEntry(initialLastEntry);
  }, [initialMood, initialLastEntry]);

  function toastAfterSuccessfulSave(previousLast: PatientMoodLastEntry | null, newLast: PatientMoodLastEntry | null) {
    if (!newLast) {
      toast.success("Сохранено");
      return;
    }
    const added = !previousLast || previousLast.id !== newLast.id;
    toast.success(added ? "Запись добавлена" : "Запись обновлена");
  }

  async function postMood(score: number, intent: PatientMoodIntent): Promise<boolean> {
    const previousSelected = selectedScore;
    const previousSaved = savedScore;
    const previousLast = lastEntry;
    setSelectedScore(score);
    setSubmittingScore(score);
    try {
      const res = await fetch("/api/patient/mood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score, intent }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        mood?: PatientMoodToday;
        lastEntry?: PatientMoodLastEntry | null;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.mood) {
        setSelectedScore(previousSelected);
        setSavedScore(previousSaved);
        setLastEntry(previousLast);
        toast.error("Не удалось сохранить, попробуйте позже.");
        return false;
      }
      setSelectedScore(data.mood.score);
      setSavedScore(data.mood.score);
      const newLast = "lastEntry" in data ? data.lastEntry : undefined;
      if (newLast !== undefined) {
        setLastEntry(newLast);
      }
      toastAfterSuccessfulSave(previousLast, newLast ?? null);
      router.refresh();
      return true;
    } catch {
      setSelectedScore(previousSelected);
      setSavedScore(previousSaved);
      setLastEntry(previousLast);
      toast.error("Не удалось сохранить, попробуйте позже.");
      return false;
    } finally {
      setSubmittingScore(null);
    }
  }

  async function onPickScore(score: number) {
    await postMood(score, "auto");
  }

  const statusLine =
    submittingScore !== null ?
      "Сохраняем..."
    : null;

  const renderMoodScale = (frozenDisabled: boolean) => (
    <PatientHomeMoodScoreRow
      moodOptions={moodOptions}
      frozenDisabled={frozenDisabled}
      selectedScore={selectedScore}
      busy={submittingScore !== null}
      onPickScore={onPickScore}
      gridClassName="flex-1"
    />
  );

  return (
    <>
      <section
        id="patient-home-mood-checkin"
        className={cn(patientHomeMoodCheckinShellClass, patientHomeMoodCardGeometryClass)}
        aria-labelledby={
          personalTierOk && !anonymousGuest ?
            "patient-home-mood-week-heading patient-home-mood-heading"
          : "patient-home-mood-heading"
        }
      >
        <div className="relative z-[1] flex h-full min-h-0 flex-col">
          {anonymousGuest ?
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5 pt-1">
              <h3 id="patient-home-mood-heading" className={cn(patientHomeMoodColumnHeadingClass, "shrink-0 px-4")}>
                Как ваше сегодня?
              </h3>
              {renderMoodScale(true)}
              <p className={patientHomeMoodStatusSlotClass}>
                <Link href={appLoginWithNextHref(routePaths.patient)} className="font-medium text-primary underline-offset-4 hover:underline">
                  Войдите
                </Link>
                , чтобы отмечать самочувствие.
              </p>
            </div>
          : !personalTierOk ?
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5 pt-1">
              <h3 id="patient-home-mood-heading" className={cn(patientHomeMoodColumnHeadingClass, "shrink-0 px-4")}>
                Как ваше сегодня?
              </h3>
              {renderMoodScale(true)}
              <p className={patientHomeMoodStatusSlotClass}>Чек-ин самочувствия будет доступен после активации профиля.</p>
            </div>
          : <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-4 pt-1">
              <div className="flex min-h-0 flex-1 flex-col gap-6 min-[560px]:flex-row min-[560px]:items-stretch min-[560px]:gap-4">
                <div className="order-2 flex min-h-0 w-full min-w-0 flex-col min-[560px]:order-1 min-[560px]:flex-1 min-[560px]:basis-0 min-[560px]:min-w-0">
                  <h3 id="patient-home-mood-week-heading" className={patientHomeMoodColumnHeadingClass}>
                    Ваша неделя
                  </h3>
                  <PatientHomeWellbeingWeekStrip
                    days={moodWeekDays}
                    timeZone={wellbeingWeekTimeZone}
                    previousSundayScore={moodWeekPreviousSundayScore}
                    lastScoreBeforeWeek={moodWeekLastScoreBeforeWeek}
                  />
                </div>
                <div
                  className={cn(
                    "order-1 flex min-h-0 w-full min-w-0 flex-col",
                    /** Ряд с 560px (кастом); Tailwind `sm` = 640px. Минимум ширины колонки иконок — как при 50% при viewport 640. */
                    "min-[560px]:order-2 min-[560px]:flex-1 min-[560px]:basis-0 min-[560px]:min-w-[calc((640px-5.5rem)/2)]",
                  )}
                >
                  <h3 id="patient-home-mood-heading" className={patientHomeMoodColumnHeadingClass}>
                    Как ваше сегодня?
                  </h3>
                  <div className="flex min-h-0 flex-1 flex-col justify-end">{renderMoodScale(false)}</div>
                </div>
              </div>
              <div className="mt-3 flex shrink-0 justify-end">
                <Link
                  href={routePaths.diary}
                  className="text-xs font-normal text-[var(--patient-block-heading)] underline-offset-2 hover:underline"
                >
                  Подробная история в дневнике
                </Link>
              </div>
              {statusLine ?
                <p className={patientHomeMoodStatusSlotClass} aria-live="polite">
                  {statusLine}
                </p>
              : null}
            </div>}
        </div>
      </section>
    </>
  );
}
