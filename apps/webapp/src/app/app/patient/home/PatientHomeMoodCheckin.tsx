"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { routePaths } from "@/app-layer/routes/paths";
import type { PatientMoodIntent, PatientMoodLastEntry, PatientMoodToday, PatientMoodWeekDay } from "@/modules/patient-mood/types";
import type { PatientHomeMoodIconOption } from "@/modules/patient-home/patientHomeMoodIcons";
import { wellbeingResubmitKind } from "@/modules/patient-mood/wellbeingConstants";
import {
  patientHomeMoodCardGeometryClass,
  patientHomeMoodCheckinShellClass,
  patientHomeMoodColumnHeadingClass,
  patientHomeMoodStatusSlotClass,
} from "./patientHomeCardStyles";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PatientHomeWellbeingWeekStrip } from "./PatientHomeWellbeingWeekStrip";
import { PatientHomeMoodScoreRow } from "./PatientHomeMoodScoreRow";

type Props = {
  moodOptions: readonly PatientHomeMoodIconOption[];
  personalTierOk: boolean;
  anonymousGuest: boolean;
  initialMood?: PatientMoodToday | null;
  initialLastEntry?: PatientMoodLastEntry | null;
  moodWeekDays?: readonly PatientMoodWeekDay[];
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
  wellbeingWeekTimeZone = "UTC",
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
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5 max-lg:pt-2 lg:pt-2.5">
              <h3 id="patient-home-mood-heading" className={cn(patientHomeMoodColumnHeadingClass, "shrink-0 px-4 lg:px-0")}>
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
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5 max-lg:pt-2 lg:pt-2.5">
              <h3 id="patient-home-mood-heading" className={cn(patientHomeMoodColumnHeadingClass, "shrink-0 px-4 lg:px-0")}>
                Как ваше сегодня?
              </h3>
              {renderMoodScale(true)}
              <p className={patientHomeMoodStatusSlotClass}>Чек-ин самочувствия будет доступен после активации профиля.</p>
            </div>
          : <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-4 max-lg:pt-2 lg:px-0 lg:pt-2">
              <div className="flex min-h-0 flex-1 flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
                <div className="flex min-h-0 w-full min-w-0 flex-col sm:w-[35%] sm:max-w-[35%] sm:shrink-0">
                  <h3 id="patient-home-mood-week-heading" className={patientHomeMoodColumnHeadingClass}>
                    Ваша неделя
                  </h3>
                  <PatientHomeWellbeingWeekStrip days={moodWeekDays} timeZone={wellbeingWeekTimeZone} />
                </div>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col sm:basis-[65%] sm:min-w-0">
                  <h3 id="patient-home-mood-heading" className={patientHomeMoodColumnHeadingClass}>
                    Как ваше сегодня?
                  </h3>
                  <div className="flex min-h-0 flex-1 flex-col justify-end">{renderMoodScale(false)}</div>
                </div>
              </div>
              <div className="mt-1 flex shrink-0 justify-start">
                <Link
                  href={routePaths.diary}
                  className="text-xs font-medium text-[var(--patient-color-primary)] underline-offset-2 hover:underline"
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
