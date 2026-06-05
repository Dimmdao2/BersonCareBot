import {
  finalizeProductAnalyticsPageKey,
  type ProductAnalyticsPageKeyOptions,
} from "@/modules/product-analytics/productAnalyticsPageKey";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Normalizes patient app paths for hourly aggregates (no query string).
 * Returns null for paths outside `/app/patient/**`.
 */
export function normalizePageKey(
  pathname: string,
  opts?: ProductAnalyticsPageKeyOptions,
): string | null {
  const trimmed = pathname.trim();
  if (!trimmed.startsWith("/app/patient")) return null;

  const pathOnly = (trimmed.split("?")[0] ?? trimmed).replace(/\/+$/, "") || "/app/patient";
  const parts = pathOnly.split("/").filter(Boolean);
  if (parts[0] !== "app" || parts[1] !== "patient") return null;

  const out = ["", "app", "patient"];
  for (let i = 2; i < parts.length; i++) {
    const seg = parts[i]!;
    const prev = parts[i - 1];
    if (UUID_RE.test(seg)) {
      out.push(":id");
    } else if (prev === "content") {
      out.push(":slug");
    } else {
      out.push(seg);
    }
  }
  const normalized = out.join("/") || "/app/patient";
  return finalizeProductAnalyticsPageKey(normalized, opts);
}
