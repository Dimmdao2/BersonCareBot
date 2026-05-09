import { Angry, Frown, Laugh, Meh, Smile } from "lucide-react";

/** Единая палитра шкалы 1–5 для главной и модалок самочувствия (fallback при отсутствии CMS-картинок). */
export const PATIENT_HOME_MOOD_SCORE_ICONS = {
  1: Angry,
  2: Frown,
  3: Meh,
  4: Smile,
  5: Laugh,
} as const;

export const PATIENT_HOME_MOOD_SCORE_ICON_CLASS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "text-red-600",
  2: "text-orange-600",
  3: "text-amber-500",
  4: "text-lime-600",
  5: "text-green-600",
};

export const PATIENT_HOME_MOOD_SCORE_CONTAINER_ACTIVE: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "border-red-300 bg-red-50/70 ring-1 ring-red-200/50",
  2: "border-orange-300 bg-orange-50/70 ring-1 ring-orange-200/50",
  3: "border-amber-300 bg-amber-50/70 ring-1 ring-amber-200/50",
  4: "border-lime-300 bg-lime-50/70 ring-1 ring-lime-200/50",
  5: "border-green-300 bg-green-50/70 ring-1 ring-green-200/50",
};

export const PATIENT_HOME_MOOD_SCORE_CONTAINER_HOVER: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "border-red-200 hover:border-red-400 hover:bg-red-50/40",
  2: "border-orange-200 hover:border-orange-400 hover:bg-orange-50/40",
  3: "border-amber-200 hover:border-amber-400 hover:bg-amber-50/40",
  4: "border-lime-200 hover:border-lime-400 hover:bg-lime-50/40",
  5: "border-green-200 hover:border-green-400 hover:bg-green-50/40",
};
