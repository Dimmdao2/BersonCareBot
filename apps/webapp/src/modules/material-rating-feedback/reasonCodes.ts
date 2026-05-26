export const MATERIAL_RATING_FEEDBACK_REASON_CODES = [
  "worse_wellbeing",
  "too_hard",
  "unclear_explanation",
  "disliked_movement",
  "video_quality",
  "other",
] as const;

export type MaterialRatingFeedbackReasonCode = (typeof MATERIAL_RATING_FEEDBACK_REASON_CODES)[number];

export const MATERIAL_RATING_FEEDBACK_REASON_LABELS: Record<MaterialRatingFeedbackReasonCode, string> = {
  worse_wellbeing: "Ухудшилось самочувствие",
  too_hard: "Слишком сложно",
  unclear_explanation: "Непонятно объяснено",
  disliked_movement: "Не понравилось движение",
  video_quality: "Качество видео",
  other: "Другое",
};

export function isMaterialRatingFeedbackReasonCode(value: string): value is MaterialRatingFeedbackReasonCode {
  return (MATERIAL_RATING_FEEDBACK_REASON_CODES as readonly string[]).includes(value);
}
