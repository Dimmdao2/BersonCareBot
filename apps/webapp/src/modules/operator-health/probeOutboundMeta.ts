/** Читает `consecutiveFailRuns` из `operator_job_status.meta_json` (outbound probe). */
export function readProbeConsecutiveFailRuns(
  metaJson: Record<string, unknown> | undefined | null,
): number {
  const v = metaJson?.consecutiveFailRuns;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0;
}
