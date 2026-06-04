export const doctorRecommendationActionabilitySelectItems: Record<string, string> = {
  actionable: "Требует выполнения",
  persistent: "Постоянная рекомендация",
};

export const treatmentProgramGroupSelectNoneItemValue = "__none__";
export const treatmentProgramGroupSelectNoneLabel = "Без группы";

/** `video_default_delivery` — глобальная стратегия выдачи видео (admin settings). */
export const videoDeliveryStrategySelectItems: Record<string, string> = {
  mp4: "Только MP4",
  hls: "Только HLS",
  auto: "Авто (предпочитать HLS, если готов)",
};
