"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Check, CheckCircle2 } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { appLoginWithNextHref } from "@/app/app/patient/home/patientHomeGuestNav";
import {
  PATIENT_HOME_MOOD_SCORE_CONTAINER_HOVER,
  PATIENT_HOME_MOOD_SCORE_ICON_CLASS,
  PATIENT_HOME_MOOD_SCORE_ICONS,
} from "@/app/app/patient/home/patientHomeMoodScaleVisual";
import { patientHomeMoodOptionButtonClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { PatientHomeSafeImage } from "@/app/app/patient/home/PatientHomeSafeImage";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PatientHomeMoodIconOption } from "@/modules/patient-home/patientHomeMoodIcons";
import type { PracticeSource } from "@/modules/patient-practice/types";
import { cn } from "@/lib/utils";
import {
  patientButtonSuccessClass,
  patientCardClass,
  patientInlineLinkClass,
  patientModalDialogContentShellClass,
  patientModalHeaderBarClass,
  patientModalDialogTitleClass,
  patientMutedTextClass,
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
        toast.error("Войдите, чтобы сохранить выполнение.");
        return;
      }
      if (!res.ok || !data.ok) {
        toast.error("Не удалось сохранить. Попробуйте позже.");
        return;
      }
      warmupSubmittedRef.current = true;
      setDialogOpen(false);
      toast.success("Записано.");
      router.push(routePaths.patient);
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
        toast.error("Войдите, чтобы сохранить выполнение.");
        return;
      }
      if (res.status === 403 && data.error === "patient_activation_required") {
        toast.error("Подтвердите профиль пациента, чтобы сохранять прогресс.");
        return;
      }
      if (!res.ok || !data.ok) {
        toast.error("Не удалось сохранить. Попробуйте позже.");
        return;
      }
      setSaved(true);
      setDialogOpen(false);
      toast.success("Записано.");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open);
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
        <DialogContent className={patientModalDialogContentShellClass}>
          <DialogHeader className={patientModalHeaderBarClass}>
            <DialogTitle className={patientModalDialogTitleClass}>{modalTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 p-4 pt-0">
            <div
              className="grid min-h-0 grid-cols-5 items-center gap-1"
              role="group"
              aria-label="Оценка самочувствия"
            >
              {moodIconOptions.map((option) => {
                const MoodIcon = PATIENT_HOME_MOOD_SCORE_ICONS[option.score];
                return (
                  <div key={option.score} className="flex min-w-0 flex-col items-center">
                    <button
                      type="button"
                      disabled={modalBusy}
                      className={cn(
                        patientHomeMoodOptionButtonClass,
                        PATIENT_HOME_MOOD_SCORE_CONTAINER_HOVER[option.score],
                        modalBusy && "cursor-not-allowed opacity-70",
                      )}
                      aria-label={`Самочувствие ${option.score} из 5: ${option.label}`}
                      onClick={() =>
                        void (isWarmup ? patchWarmupFeeling(option.score) : submitWithFeeling(option.score))
                      }
                    >
                      <PatientHomeSafeImage
                        src={modalBusy ? null : option.imageUrl}
                        alt=""
                        className="size-full rounded-full object-cover"
                        loading="lazy"
                        fallback={
                          <MoodIcon
                            aria-hidden
                            className={cn(
                              "size-8 shrink-0 sm:size-9",
                              PATIENT_HOME_MOOD_SCORE_ICON_CLASS[option.score],
                            )}
                            strokeWidth={1.15}
                          />
                        }
                      />
                    </button>
                  </div>
                );
              })}
            </div>
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
