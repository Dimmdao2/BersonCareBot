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
import {
  patientButtonPrimaryClass,
  patientButtonSecondaryClass,
  patientMutedTextClass,
  patientPortalModalSurfaceClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

  function toastAfterSuccessfulSave(intent: PatientMoodIntent, hadPreviousLastEntry: boolean) {
    const added = intent === "new_instant" || (intent === "auto" && !hadPreviousLastEntry);
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
      toastAfterSuccessfulSave(intent, previousLast != null);
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
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5 max-md:pt-1 md:pt-2">
              <h3 id="patient-home-mood-heading" className={cn(patientHomeMoodColumnHeadingClass, "shrink-0 px-4 md:px-0")}>
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
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5 max-md:pt-1 md:pt-2">
              <h3 id="patient-home-mood-heading" className={cn(patientHomeMoodColumnHeadingClass, "shrink-0 px-4 md:px-0")}>
                Как ваше сегодня?
              </h3>
              {renderMoodScale(true)}
              <p className={patientHomeMoodStatusSlotClass}>Чек-ин самочувствия будет доступен после активации профиля.</p>
            </div>
          : <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-4 max-md:pt-1 md:px-0 md:pt-1">
              <div className="flex min-h-0 flex-1 flex-col gap-6 sm:flex-row sm:items-stretch sm:gap-4">
                <div className="order-2 flex min-h-0 w-full min-w-0 flex-col sm:order-1 sm:w-[35%] sm:max-w-[35%] sm:shrink-0">
                  <h3 id="patient-home-mood-week-heading" className={patientHomeMoodColumnHeadingClass}>
                    Ваша неделя
                  </h3>
                  <PatientHomeWellbeingWeekStrip days={moodWeekDays} timeZone={wellbeingWeekTimeZone} />
                </div>
                <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col sm:order-2 sm:basis-[65%] sm:min-w-0">
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
        <DialogContent
          showCloseButton
          className={cn(
            patientPortalModalSurfaceClass,
            "flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(92vw,22rem)]",
            "rounded-2xl border border-[var(--patient-border)] shadow-lg",
            "[&_[data-slot=dialog-close]]:text-[var(--patient-text-muted)] [&_[data-slot=dialog-close]]:hover:bg-black/[0.06] [&_[data-slot=dialog-close]]:focus-visible:ring-[var(--patient-border)]",
          )}
        >
          <DialogHeader className="shrink-0 gap-1.5 px-4 pb-0 pt-4 pr-12 text-left">
            <DialogTitle className={cn(patientSectionTitleClass, "text-base leading-snug")}>Заменить или добавить</DialogTitle>
            {choicePrevLast != null && choicePrevLast.score != null ?
              <p className={cn(patientMutedTextClass, "leading-snug")}>
                Последняя — <span className="font-medium text-[var(--patient-text-primary)]">{choicePrevLast.score}</span>
                . Обновить её или добавить строку?
              </p>
            : choicePrevLast != null ?
              <p className={cn(patientMutedTextClass, "leading-snug")}>Обновить последнюю или добавить строку?</p>
            : null}
          </DialogHeader>
          <div className="flex flex-col gap-2 px-4 pb-4 pt-3">
            <button type="button" className={patientButtonSecondaryClass} onClick={() => void confirmChoice("new_instant")}>
              Новая запись
            </button>
            <button type="button" className={patientButtonPrimaryClass} onClick={() => void confirmChoice("replace_last")}>
              Изменить прошлую
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
