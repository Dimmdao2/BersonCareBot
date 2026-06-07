/** Rolling window presets for content / notifications / usage analytics (`windowHours` query). */
export const DOCTOR_ANALYTICS_WINDOW_HOUR_PRESETS = [
  { hours: 24, label: "24 ч" },
  { hours: 168, label: "7 дн." },
  { hours: 720, label: "30 дн." },
] as const;
