"use client";

import Link from "next/link";
import { Angry, Frown, Laugh, Meh, Smile } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { routePaths } from "@/app-layer/routes/paths";
import type { PatientMoodIntent, PatientMoodLastEntry, PatientMoodToday, PatientMoodWeekDay } from "@/modules/patient-mood/types";
import type { PatientHomeMoodIconOption } from "@/modules/patient-home/patientHomeMoodIcons";
import { wellbeingResubmitKind } from "@/modules/patient-mood/wellbeingConstants";
import {
  patientHomeBlockHeadingClass,
  patientHomeMoodCardGeometryClass,
  patientHomeMoodCheckinShellClass,
  patientHomeMoodOptionButtonClass,
  patientHomeMoodStatusSlotClass,
} from "./patientHomeCardStyles";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PatientHomeWellbeingWeekStrip } from "./PatientHomeWellbeingWeekStrip";

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

const MOOD_SCORE_CONTAINER_ACTIVE: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "border-red-300 bg-red-50/70 ring-1 ring-red-200/50",
  2: "border-orange-300 bg-orange-50/70 ring-1 ring-orange-200/50",
  3: "border-amber-300 bg-amber-50/70 ring-1 ring-amber-200/50",
  4: "border-lime-300 bg-lime-50/70 ring-1 ring-lime-200/50",
  5: "border-green-300 bg-green-50/70 ring-1 ring-green-200/50",
};

const MOOD_SCORE_CONTAINER_HOVER: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "border-red-200 hover:border-red-400 hover:bg-red-50/40",
  2: "border-orange-200 hover:border-orange-400 hover:bg-orange-50/40",
  3: "border-amber-200 hover:border-amber-400 hover:bg-amber-50/40",
  4: "border-lime-200 hover:border-lime-400 hover:bg-lime-50/40",
  5: "border-green-200 hover:border-green-400 hover:bg-green-50/40",
};

type Props = {
  moodOptions: readonly PatientHomeMoodIconOption[];
  personalTierOk: boolean;
  anonymousGuest: boolean;
  initialMood?: PatientMoodToday | null;
  initialLastEntry?: PatientMoodLastEntry | null;
  moodWeekDays?: readonly PatientMoodWeekDay[];
  /** IANA TZ главной (для полосы недели). */
  appDisplayTimeZone?: string;
};

export function PatientHomeMoodCheckin({
  moodOptions,
  personalTierOk,
  anonymousGuest,
  initialMood = null,
  initialLastEntry = null,
  moodWeekDays = [],
  appDisplayTimeZone = "UTC",
}: Props) {
  const router = useRouter();
  const [selectedScore, setSelectedScore] = useState<number | null>(initialMood?.score ?? null);
  const [savedScore, setSavedScore] = useState<number | null>(initialMood?.score ?? null);
  const [lastEntry, setLastEntry] = useState<PatientMoodLastEntry | null>(initialLastEntry);
  const [submittingScore, setSubmittingScore] = useState<number | null>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [choiceScore, setChoiceScore] = useState<number | null>(null);
  const [choicePrevLast, setChoicePrevLast] = useState<PatientMoodLastEntry | null>(null);

  useEffect(() => {
    setSelectedScore(initialMood?.score ?? null);
    setSavedScore(initialMood?.score ?? null);
    setLastEntry(initialLastEntry);
  }, [initialMood, initialLastEntry]);

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
      if (res.status === 409 && data.error === "intent_required" && data.lastEntry) {
        setSelectedScore(previousSelected);
        setSavedScore(previousSaved);
        setLastEntry(data.lastEntry);
        setChoiceScore(score);
        setChoicePrevLast(data.lastEntry);
        setChoiceOpen(true);
        return false;
      }
      if (!res.ok || !data.ok || !data.mood) {
        setSelectedScore(previousSelected);
        setSavedScore(previousSaved);
        setLastEntry(previousLast);
        toast.error("Не удалось сохранить, попробуйте позже.");
        return false;
      }
      setSelectedScore(data.mood.score);
      setSavedScore(data.mood.score);
      if ("lastEntry" in data && data.lastEntry !== undefined) {
        setLastEntry(data.lastEntry);
      }
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
    if (!lastEntry) {
      await postMood(score, "auto");
      return;
    }
    const kind = wellbeingResubmitKind(lastEntry.recordedAt);
    if (kind === "replace_silent") {
      await postMood(score, "auto");
      return;
    }
    if (kind === "modal") {
      setChoiceScore(score);
      setChoicePrevLast(lastEntry);
      setChoiceOpen(true);
      return;
    }
    await postMood(score, "new_instant");
  }

  async function confirmChoice(intent: "replace_last" | "new_instant") {
    if (choiceScore == null) return;
    const ok = await postMood(choiceScore, intent);
    if (ok) setChoiceOpen(false);
  }

  const statusLine =
    submittingScore !== null ?
      "Сохраняем..."
    : null;

  const renderMoodScale = (disabled: boolean) => (
    <div className="grid min-h-[3rem] flex-1 grid-cols-5 items-center gap-1.5" role="group" aria-label="Оценка самочувствия">
      {moodOptions.map((option) => {
        const active = selectedScore === option.score;
        const MoodIcon = MOOD_SCORE_ICONS[option.score];
        return (
          <div key={option.score} className="flex min-w-0 flex-col items-center">
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
              onClick={() => void onPickScore(option.score)}
            >
              <PatientHomeSafeImage
                src={disabled ? null : option.imageUrl}
                alt=""
                className="size-full rounded-full object-cover"
                loading="lazy"
                fallback={
                  <MoodIcon
                    aria-hidden
                    className={cn("size-10 shrink-0 sm:size-11", MOOD_SCORE_ICON_CLASS[option.score])}
                    strokeWidth={1.25}
                  />
                }
              />
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <section
        id="patient-home-mood-checkin"
        className={cn(patientHomeMoodCheckinShellClass, patientHomeMoodCardGeometryClass)}
        aria-labelledby="patient-home-mood-heading"
      >
        <div className="relative z-[1] flex h-full min-h-0 flex-col">
          <div className="shrink-0">
            <h3 id="patient-home-mood-heading" className={cn(patientHomeBlockHeadingClass, "px-4 lg:px-0")}>
              Как вы себя чувствуете?
            </h3>
          </div>
          {anonymousGuest ?
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5 max-lg:pt-2 lg:pt-2.5">
              {renderMoodScale(true)}
              <p className={patientHomeMoodStatusSlotClass}>
                <Link href={appLoginWithNextHref(routePaths.patient)} className="font-medium text-primary underline-offset-4 hover:underline">
                  Войдите
                </Link>
                , чтобы отмечать самочувствие.
              </p>
            </div>
          : !personalTierOk ?
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5 max-lg:pt-2 lg:pt-2.5">
              {renderMoodScale(true)}
              <p className={patientHomeMoodStatusSlotClass}>Чек-ин самочувствия будет доступен после активации профиля.</p>
            </div>
          : <div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5 max-lg:pt-2 lg:pt-2.5">
              {renderMoodScale(false)}
              {statusLine ?
                <p className={patientHomeMoodStatusSlotClass} aria-live="polite">
                  {statusLine}
                </p>
              : null}
              <PatientHomeWellbeingWeekStrip days={moodWeekDays} timeZone={appDisplayTimeZone} />
            </div>}
        </div>
      </section>

      <Dialog
        open={choiceOpen}
        onOpenChange={(open) => {
          setChoiceOpen(open);
          if (!open) {
            setSelectedScore(savedScore);
            setChoiceScore(null);
            setChoicePrevLast(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm" showCloseButton>
          <DialogHeader>
            <DialogTitle>Самочувствие</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {choicePrevLast != null && choicePrevLast.score != null ?
              <>
                Новая запись или изменить прошлую оценку{" "}
                <span className="font-medium text-foreground">{choicePrevLast.score}</span>?
              </>
            : choicePrevLast != null ?
              "Новая запись или изменить прошлую?"
            : null}
          </p>
          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-stretch">
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="flex-1" onClick={() => void confirmChoice("new_instant")}>
                Новая запись
              </Button>
              <Button type="button" className="flex-1" onClick={() => void confirmChoice("replace_last")}>
                Изменить прошлую
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
