export const DEFAULT_PRODUCT_ANALYTICS_WINDOW_HOURS = 168;
export const MIN_PRODUCT_ANALYTICS_WINDOW_HOURS = 1;
export const MAX_PRODUCT_ANALYTICS_WINDOW_HOURS = 720;

export function clampProductAnalyticsWindowHours(raw: unknown): number {
  const n =
    typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_PRODUCT_ANALYTICS_WINDOW_HOURS;
  return Math.min(
    MAX_PRODUCT_ANALYTICS_WINDOW_HOURS,
    Math.max(MIN_PRODUCT_ANALYTICS_WINDOW_HOURS, n || DEFAULT_PRODUCT_ANALYTICS_WINDOW_HOURS),
  );
}

export function parseProductAnalyticsWindowHours(param: string | null): number {
  if (param == null || param.trim() === "") return DEFAULT_PRODUCT_ANALYTICS_WINDOW_HOURS;
  const parsed = Number.parseInt(param.trim(), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PRODUCT_ANALYTICS_WINDOW_HOURS;
  return clampProductAnalyticsWindowHours(parsed);
}
