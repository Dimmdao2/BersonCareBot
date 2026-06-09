/** Читает `consecutiveFailRuns` из `operator_job_status.meta_json` (outbound probe). */
export function readProbeConsecutiveFailRuns(
  metaJson: Record<string, unknown> | undefined | null,
): number {
  const v = metaJson?.consecutiveFailRuns;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0;
}

export type ProbeIntegrationKey = "max" | "rubitime" | "telegram" | "google_calendar";

export type ProbeIntegrationOutcome = "ok" | "fail" | "skipped_not_configured" | "no_data";

export function readProbeIntegrationOutcome(
  metaJson: Record<string, unknown> | undefined | null,
  key: ProbeIntegrationKey,
): ProbeIntegrationOutcome {
  const v = metaJson?.[key];
  if (v === "ok" || v === "fail" || v === "skipped_not_configured") return v;
  return "no_data";
}
