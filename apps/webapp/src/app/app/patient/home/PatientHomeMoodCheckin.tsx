"use client";

import { useCallback, useRef, useState } from "react";
import { patientHomeCardGradientWarmClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { cn } from "@/lib/utils";

const MOOD_EMOJI = ["😣", "😐", "🙂", "😊", "🌟"] as const;

export type PatientHomeMoodCheckinProps = {
  /** До 5 URL иконок из CMS; пустые слоты — emoji. */
  moodIconUrls?: (string | null)[] | null;
  /** Фоновая картинка карточки (опционально). */
  imageUrl?: string | null;
  disabled?: boolean;
  /** POST endpoint (пока может отсутствовать на backend — откат optimistic UI). */
  submitPath?: string;
};

/**
 * Чек-ин настроения: тёплый градиент, 5 равных слотов (§10.7).
 */
export function PatientHomeMoodCheckin({
  moodIconUrls,
  imageUrl,
  disabled,
  submitPath = "/api/patient/mood",
}: PatientHomeMoodCheckinProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const selectedRef = useRef<number | null>(null);
  selectedRef.current = selected;

  const submit = useCallback(
    async (index: number) => {
      if (disabled || submitting) return;
      const prev = selectedRef.current;
      setSelected(index);
      setSubmitting(true);
      try {
        const res = await fetch(submitPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moodIndex: index }),
        });
        if (!res.ok) {
          setSelected(prev);
        }
      } catch {
        setSelected(prev);
      } finally {
        setSubmitting(false);
      }
    },
    [disabled, submitPath, submitting],
  );

  const icons = moodIconUrls?.length
    ? Array.from({ length: 5 }, (_, i) => moodIconUrls[i] ?? null)
    : Array.from({ length: 5 }, () => null);

  return (
    <section
      id="patient-home-mood-checkin"
      className={cn(patientHomeCardGradientWarmClass, "relative min-h-[140px] overflow-hidden")}
    >
      {imageUrl ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-1/3 max-w-[140px] bg-cover bg-center opacity-25"
          style={{ backgroundImage: `url(${imageUrl})` }}
          aria-hidden
        />
      ) : null}
      <div className="relative z-[1]">
        <h2 className="text-lg font-bold text-[var(--patient-text-primary)]">Как вы себя чувствуете?</h2>
        <p className="mt-1 text-sm text-[var(--patient-text-secondary)]">
          Отметьте своё состояние одним касанием
        </p>
        <div className="mt-4 grid grid-cols-5 gap-2">
          {icons.map((url, index) => {
            const pressed = selected === index;
            return (
              <button
                key={index}
                type="button"
                disabled={disabled || submitting}
                aria-pressed={pressed}
                aria-label={`Настроение ${index + 1} из 5`}
                onClick={() => void submit(index)}
                className={cn(
                  "flex min-h-[48px] w-full flex-col items-center justify-center rounded-2xl border-2 border-transparent bg-white/50 py-2 transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
                  pressed && "border-[var(--patient-color-primary)] bg-[#eef2ff] ring-2 ring-[var(--patient-color-primary)]",
                  (disabled || submitting) && "cursor-not-allowed opacity-60",
                )}
              >
                {url ? (
                  <span className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element -- CMS URL, small slot */}
                    <img src={url} alt="" className="size-9 object-contain" loading="lazy" />
                  </span>
                ) : (
                  <span className="text-2xl leading-none" aria-hidden>
                    {MOOD_EMOJI[index]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {disabled ? (
          <p className="mt-3 text-xs text-[var(--patient-text-muted)]">Войдите, чтобы сохранять настроение.</p>
        ) : null}
      </div>
    </section>
  );
}
