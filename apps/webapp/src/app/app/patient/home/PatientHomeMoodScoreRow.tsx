"use client";

import type { PatientHomeMoodIconOption } from "@/modules/patient-home/patientHomeMoodIcons";
import { patientHomeMoodOptionButtonClass } from "./patientHomeCardStyles";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import {
  PATIENT_HOME_MOOD_SCORE_CONTAINER_ACTIVE,
  PATIENT_HOME_MOOD_SCORE_CONTAINER_HOVER,
  PATIENT_HOME_MOOD_SCORE_ICON_CLASS,
  PATIENT_HOME_MOOD_SCORE_ICONS,
} from "./patientHomeMoodScaleVisual";
import { cn } from "@/lib/utils";

type Props = {
  moodOptions: readonly PatientHomeMoodIconOption[];
  /** Гость / без tier: без картинок из настроек, кнопки неактивны (как блок «Как ваше сегодня?» на главной). */
  frozenDisabled: boolean;
  /** Выбранный балл — кольцо/фон `ACTIVE`, как на главной. */
  selectedScore: number | null;
  /** Блокировка кликов во время запроса; картинки не скрываем (как на главной при отправке). */
  busy: boolean;
  onPickScore: (score: number) => void;
  /** Опционально: главная передаёт `flex-1` для растягивания сетки в колонке. */
  gridClassName?: string;
};

/**
 * Единая сетка 1–5 для самочувствия: главная, модалка после практики, модалка разминки.
 * Визуально совпадает с блоком «Как ваше сегодня?» (`PatientHomeMoodCheckin`).
 */
export function PatientHomeMoodScoreRow({
  moodOptions,
  frozenDisabled,
  selectedScore,
  busy,
  onPickScore,
  gridClassName,
}: Props) {
  const hideImages = frozenDisabled;
  const buttonDisabled = frozenDisabled || busy;

  return (
    <div
      className={cn("grid min-h-0 grid-cols-5 items-center gap-1", gridClassName)}
      role="group"
      aria-label="Оценка самочувствия"
    >
      {moodOptions.map((option) => {
        const active = selectedScore === option.score;
        const MoodIcon = PATIENT_HOME_MOOD_SCORE_ICONS[option.score];
        return (
          <div key={option.score} className="flex min-w-0 flex-col items-center">
            <button
              type="button"
              aria-label={`Самочувствие ${option.score} из 5: ${option.label}`}
              aria-pressed={active}
              disabled={buttonDisabled}
              className={cn(
                patientHomeMoodOptionButtonClass,
                active
                  ? PATIENT_HOME_MOOD_SCORE_CONTAINER_ACTIVE[option.score]
                  : PATIENT_HOME_MOOD_SCORE_CONTAINER_HOVER[option.score],
                buttonDisabled && "cursor-not-allowed opacity-70",
              )}
              onClick={() => onPickScore(option.score)}
            >
              <PatientHomeSafeImage
                src={hideImages ? null : option.imageUrl}
                alt=""
                className="size-full rounded-full object-cover"
                loading="lazy"
                fallback={
                  <MoodIcon
                    aria-hidden
                    className={cn("size-8 shrink-0 sm:size-9", PATIENT_HOME_MOOD_SCORE_ICON_CLASS[option.score])}
                    strokeWidth={1.15}
                  />
                }
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}
