import type { AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";

/** Legacy `today` and unknown values normalize to `week`. */
export function parseAdminStatsTimePreset(raw: string | null): AdminStatsTimePreset {
  if (raw === "day" || raw === "month" || raw === "custom") return raw;
  return "week";
}
