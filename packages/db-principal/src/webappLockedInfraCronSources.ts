/**
 * Infra principals for webapp internal Bearer cron and signed integrator scheduler wakes.
 * In locked mode these run on the staff request pool with `SET ROLE app_staff` (no tenant id).
 */
export const WEBAPP_LOCKED_INFRA_CRON_SOURCES = new Set<string>([
  'api/integrator/operator-health/digest-wake:POST',
  'api/integrator/system-health/guard-wake:POST',
  'api/internal/operator-health-digest/tick:POST',
  'api/internal/operator-health-critical/tick:POST',
  'api/internal/system-health-guard/tick:POST',
  'api/internal/media-hls-proxy-errors/retention:POST',
  'api/internal/media-playback-stats/retention:POST',
  'api/internal/media-pending-delete/purge:POST',
  'api/internal/media-multipart/cleanup:POST',
  'api/internal/media-preview/process:POST',
  'api/internal/media-transcode/enqueue:POST',
  'api/internal/media-transcode/reconcile:POST',
  'api/internal/product-analytics/retention:POST',
  'api/internal/specialist-task-reminders/tick:POST',
  'api/internal/heartbeat/pipeline_delivery:POST',
  'api/internal/heartbeat/pipeline_delivery:GET',
  'api/internal/heartbeat/digest:POST',
  'api/internal/heartbeat/digest:GET',
]);

export function isWebappLockedInfraCronSource(source: string | undefined): boolean {
  const normalized = source?.trim() ?? '';
  return normalized.length > 0 && WEBAPP_LOCKED_INFRA_CRON_SOURCES.has(normalized);
}
