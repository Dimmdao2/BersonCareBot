"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Check, CheckCircle2 } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { appLoginWithNextHref } from "@/app/app/patient/home/patientHomeGuestNav";
import { PatientHomeMoodScoreRow } from "@/app/app/patient/home/PatientHomeMoodScoreRow";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PatientHomeMoodIconOption } from "@/modules/patient-home/patientHomeMoodIcons";
import type { PracticeSource } from "@/modules/patient-practice/types";
import { cn } from "@/lib/utils";
import {
  patientButtonSuccessClass,
  patientCardClass,
  patientInlineLinkClass,
  patientMutedTextClass,
  patientSectionTitleClass,
  patientSurfaceSuccessClass,
} from "@/shared/ui/patientVisual";

type Props = {
  contentPageId: string;
  contentPath: string;
  practiceSource: PracticeSource;
  guest: boolean;
  needsActivation: boolean;
  /** Те же 5 опций, что блок самочувствия на главной (`patient_home_mood_icons`). */
  moodIconOptions: readonly PatientHomeMoodIconOption[];
};

export function PatientContentPracticeComplete({
  contentPageId,
  contentPath,
  practiceSource,
  guest,
  needsActivation,
  moodIconOptions,
}: Props) {
  const router = useRouter();
  const isWarmup = practiceSource === "daily_warmup";
  const warmupSubmittedRef = useRef(false);
  /** Синхронная защита от двойного клика по CTA до установки `postingWarmup`. */
  const warmupPostGuardRef = useRef(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [postingWarmup, setPostingWarmup] = useState(false);
  const [saved, setSaved] = useState(false);
  const [warmupCompletionId, setWarmupCompletionId] = useState<string | null>(null);
  /** Выбранный балл в модалке — подсветка как на главной; сбрасываем при открытии/ошибке. */
  const [pickedMoodScore, setPickedMoodScore] = useState<number | null>(null);

  const loginHref = appLoginWithNextHref(contentPath);

  async function postWarmupCompletionThenOpenModal() {
    if (postingWarmup || warmupPostGuardRef.current) return;
    warmupPostGuardRef.current = true;
    setPostingWarmup(true);
    try {
      const res = await fetch("/api/patient/practice/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentPageId,
          source: practiceSource,
          feeling: null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        id?: string;
      };
      if (res.status === 401) {
        warmupPostGuardRef.current = false;
        toast.error("Войдите, чтобы сохранить выполнение.");
        return;
      }
      if (res.status === 403 && data.error === "patient_activation_required") {
        warmupPostGuardRef.current = false;
        toast.error("Подтвердите профиль пациента, чтобы сохранять прогресс.");
        return;
      }
      if (!res.ok || !data.ok || !data.id) {
        warmupPostGuardRef.current = false;
        toast.error("Не удалось сохранить. Попробуйте позже.");
        return;
      }
      setWarmupCompletionId(data.id);
      setDialogOpen(true);
    } catch {
      warmupPostGuardRef.current = false;
      toast.error("Не удалось сохранить. Попробуйте позже.");
    } finally {
      setPostingWarmup(false);
    }
  }

  async function patchWarmupFeeling(feeling: number) {
    if (!warmupCompletionId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/patient/practice/completion/${warmupCompletionId}/feeling`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feeling }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; duplicate?: boolean };
      if (res.status === 401) {
        setPickedMoodScore(null);
        toast.error("Войдите, чтобы сохранить выполнение.");
        return;
      }
      if (!res.ok || !data.ok) {
        setPickedMoodScore(null);
        toast.error("Не удалось сохранить. Попробуйте позже.");
        return;
      }
      warmupSubmittedRef.current = true;
      setDialogOpen(false);
      toast.success("Записано.");
      router.push(routePaths.patient);
    } catch {
      setPickedMoodScore(null);
      toast.error("Не удалось сохранить. Попробуйте позже.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitWithFeeling(feeling: number | null) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/patient/practice/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentPageId,
          source: practiceSource,
          feeling,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.status === 401) {
        setPickedMoodScore(null);
        toast.error("Войдите, чтобы сохранить выполнение.");
        return;
      }
      if (res.status === 403 && data.error === "patient_activation_required") {
        setPickedMoodScore(null);
        toast.error("Подтвердите профиль пациента, чтобы сохранять прогресс.");
        return;
      }
      if (!res.ok || !data.ok) {
        setPickedMoodScore(null);
        toast.error("Не удалось сохранить. Попробуйте позже.");
        return;
      }
      setSaved(true);
      setDialogOpen(false);
      toast.success("Записано.");
      router.refresh();
    } catch {
      setPickedMoodScore(null);
      toast.error("Не удалось сохранить. Попробуйте позже.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleModalPickScore(score: number) {
    setPickedMoodScore(score);
    if (isWarmup) void patchWarmupFeeling(score);
    else void submitWithFeeling(score);
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open);
    if (open) {
      setPickedMoodScore(null);
    }
    if (!open && isWarmup && warmupCompletionId !== null && !warmupSubmittedRef.current) {
      setSaved(true);
    }
  }

  if (guest) {
    return (
      <section id="patient-content-practice-complete" className={patientCardClass}>
        <p className={patientMutedTextClass}>
          <Link href={loginHref} className={patientInlineLinkClass}>
            Войдите
          </Link>
          , чтобы отмечать выполнение практики.
        </p>
      </section>
    );
  }

  if (needsActivation) {
    return (
      <section id="patient-content-practice-complete" className={patientCardClass}>
        <p className={patientMutedTextClass}>
          Активируйте профиль пациента, чтобы отмечать прогресс.{" "}
          <Link
            href={`${routePaths.bindPhone}?next=${encodeURIComponent(contentPath)}`}
            className={patientInlineLinkClass}
          >
            Подтвердить телефон
          </Link>
        </p>
      </section>
    );
  }

  if (saved) {
    return (
      <section id="patient-content-practice-complete" className={patientSurfaceSuccessClass}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 shrink-0 text-[var(--patient-color-success,#16a34a)]" aria-hidden />
          <p className="text-sm font-medium text-[var(--patient-surface-success-text)]">
            Практика отмечена выполненной.
          </p>
        </div>
      </section>
    );
  }

  const modalTitle = isWarmup ? "Как самочувствие после разминки?" : "Как самочувствие после?";
  const modalBusy = submitting || (isWarmup && postingWarmup);

  return (
    <>
      <section id="patient-content-practice-complete" className={patientCardClass}>
        <button
          type="button"
          className={cn(patientButtonSuccessClass, "w-full")}
          disabled={postingWarmup || submitting}
          onClick={() => void (isWarmup ? postWarmupCompletionThenOpenModal() : setDialogOpen(true))}
        >
          <Check className="size-5 shrink-0" aria-hidden />
          Я выполнил(а) практику
        </button>
      </section>
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className={cn(
            "flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0",
            "[&_[data-slot=dialog-close]]:text-[var(--patient-text-muted)] [&_[data-slot=dialog-close]]:hover:bg-black/[0.06] [&_[data-slot=dialog-close]]:focus-visible:ring-[var(--patient-border)]",
          )}
        >
          <DialogHeader className="shrink-0 gap-0 px-4 pb-2 pt-4 pr-12">
            <DialogTitle className={cn(patientSectionTitleClass, "text-sm leading-snug")}>
              {modalTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 px-4 pb-4">
            <PatientHomeMoodScoreRow
              moodOptions={moodIconOptions}
              frozenDisabled={false}
              selectedScore={pickedMoodScore}
              busy={modalBusy}
              onPickScore={handleModalPickScore}
            />
            {!isWarmup ? (
              <button
                type="button"
                disabled={submitting}
                className={cn(
                  "inline-flex w-full items-center justify-center rounded-md px-4 py-2 text-sm text-[var(--patient-text-muted)] transition-colors",
                  "hover:bg-[var(--patient-color-primary-soft)]/30",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
                onClick={() => void submitWithFeeling(null)}
              >
                Пропустить
              </button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
