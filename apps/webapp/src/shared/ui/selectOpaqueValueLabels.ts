import { formatNormalizedTestDecisionRu } from "@/modules/treatment-program/types";

/**
 * Значения для пропа `items` у `<Select>` (@base-ui), когда `value` — нечитаемый ключ/id,
 * а в триггере нужна русская подпись до монтирования списка.
 */
export const patientLfkDifficultySelectItems: Record<string, string> = {
  easy: "Легко",
  medium: "Средне",
  hard: "Тяжело",
};

export const patientTestQualDecisionSelectItems: Record<string, string> = {
  passed: formatNormalizedTestDecisionRu("passed"),
  failed: formatNormalizedTestDecisionRu("failed"),
  partial: formatNormalizedTestDecisionRu("partial"),
};

export const doctorRecommendationActionabilitySelectItems: Record<string, string> = {
  actionable: "Требует выполнения",
  persistent: "Постоянная рекомендация",
};

export const symptomTrackingEntryTypeSelectItems: Record<string, string> = {
  instant: "В моменте",
  daily: "За день",
};

export const treatmentProgramGroupSelectNoneItemValue = "__none__";
export const treatmentProgramGroupSelectNoneLabel = "Без группы";

/** `video_default_delivery` — глобальная стратегия выдачи видео (admin settings). */
export const videoDeliveryStrategySelectItems: Record<string, string> = {
  mp4: "Только MP4",
  hls: "Только HLS",
  auto: "Авто (предпочитать HLS, если готов)",
};
