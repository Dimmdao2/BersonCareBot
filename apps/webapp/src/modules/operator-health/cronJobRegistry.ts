import {
  OPERATOR_ANALYTICS_JOB_FAMILY,
  OPERATOR_BACKUP_JOB_FAMILY,
  OPERATOR_HEALTH_JOB_FAMILY,
  OPERATOR_MEDIA_JOB_FAMILY,
  OPERATOR_MEDIA_HLS_PROXY_ERRORS_RETENTION_JOB_KEY,
  OPERATOR_MEDIA_MULTIPART_CLEANUP_JOB_KEY,
  OPERATOR_MEDIA_PENDING_DELETE_PURGE_JOB_KEY,
  OPERATOR_MEDIA_PLAYBACK_STATS_RETENTION_JOB_KEY,
  OPERATOR_MEDIA_PREVIEW_PROCESS_JOB_KEY,
  OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
  OPERATOR_PRODUCT_ANALYTICS_RETENTION_JOB_KEY,
  OPERATOR_REMINDERS_JOB_FAMILY,
  OPERATOR_SPECIALIST_TASKS_JOB_FAMILY,
  OPERATOR_SPECIALIST_TASK_REMINDERS_TICK_JOB_KEY,
  OPERATOR_SYSTEM_HEALTH_GUARD_TICK_JOB_KEY,
  OPERATOR_HEALTH_CRITICAL_TICK_JOB_KEY,
  OPERATOR_HEALTH_DIGEST_TICK_JOB_KEY,
  OPERATOR_WEB_PUSH_ONLY_REMINDER_TICK_JOB_KEY,
} from "@/modules/operator-health/reconcileJobKeys";

export type CronJobRegistryKind = "internal_http" | "backup_shell";

export type CronJobRegistryEntry = {
  id: string;
  jobFamily: string;
  jobKey: string;
  label: string;
  scheduleHint: string;
  /** После этого интервала без успешного tick — degraded. */
  staleAfterSec: number;
  kind: CronJobRegistryKind;
  internalPath?: string;
  /**
   * Нет строки в `operator_job_status` — только «нет данных» по задаче.
   * Не ухудшает сводный статус «Cron-задачи хоста» (редкое расписание, опциональный job).
   */
  optionalNoData?: boolean;
};

/** Канонический список host cron / internal jobs для «Здоровье системы». */
export const CRON_JOB_REGISTRY: readonly CronJobRegistryEntry[] = [
  {
    id: "webpush_reminders",
    jobFamily: OPERATOR_REMINDERS_JOB_FAMILY,
    jobKey: OPERATOR_WEB_PUSH_ONLY_REMINDER_TICK_JOB_KEY,
    label: "Web Push напоминания",
    scheduleHint: "каждую минуту",
    staleAfterSec: 5 * 60,
    kind: "internal_http",
    internalPath: "/api/internal/reminders/web-push-only/tick",
  },
  {
    id: "media_purge",
    jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
    jobKey: OPERATOR_MEDIA_PENDING_DELETE_PURGE_JOB_KEY,
    label: "Удаление медиа (purge)",
    scheduleHint: "каждую минуту",
    staleAfterSec: 3 * 60,
    kind: "internal_http",
    internalPath: "/api/internal/media-pending-delete/purge",
  },
  {
    id: "media_multipart",
    jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
    jobKey: OPERATOR_MEDIA_MULTIPART_CLEANUP_JOB_KEY,
    label: "Multipart cleanup",
    scheduleHint: "каждые 10 мин",
    staleAfterSec: 25 * 60,
    kind: "internal_http",
    internalPath: "/api/internal/media-multipart/cleanup",
  },
  {
    id: "media_preview",
    jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
    jobKey: OPERATOR_MEDIA_PREVIEW_PROCESS_JOB_KEY,
    label: "Превью медиа",
    scheduleHint: "каждую минуту",
    staleAfterSec: 3 * 60,
    kind: "internal_http",
    internalPath: "/api/internal/media-preview/process",
  },
  {
    id: "media_transcode_reconcile",
    jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
    jobKey: OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
    label: "HLS reconcile",
    scheduleHint: "каждые 10 мин",
    staleAfterSec: 25 * 60,
    kind: "internal_http",
    internalPath: "/api/internal/media-transcode/reconcile",
  },
  {
    id: "system_health_guard",
    jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
    jobKey: OPERATOR_SYSTEM_HEALTH_GUARD_TICK_JOB_KEY,
    label: "Health guard (outbox)",
    scheduleHint: "каждые 15 мин",
    staleAfterSec: 35 * 60,
    kind: "internal_http",
    internalPath: "/api/internal/system-health-guard/tick",
  },
  {
    id: "operator_health_critical",
    jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
    jobKey: OPERATOR_HEALTH_CRITICAL_TICK_JOB_KEY,
    label: "Critical health tick",
    scheduleHint: "каждые 5 мин",
    staleAfterSec: 12 * 60,
    kind: "internal_http",
    internalPath: "/api/internal/operator-health-critical/tick",
  },
  {
    id: "operator_health_digest",
    jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
    jobKey: OPERATOR_HEALTH_DIGEST_TICK_JOB_KEY,
    label: "Digest health tick",
    scheduleHint: "ежечасно в :00",
    staleAfterSec: 2 * 60 * 60,
    kind: "internal_http",
    internalPath: "/api/internal/operator-health-digest/tick",
  },
  {
    id: "playback_retention",
    jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
    jobKey: OPERATOR_MEDIA_PLAYBACK_STATS_RETENTION_JOB_KEY,
    label: "Retention playback stats",
    scheduleHint: "еженедельно",
    staleAfterSec: 8 * 24 * 60 * 60,
    kind: "internal_http",
    internalPath: "/api/internal/media-playback-stats/retention",
  },
  {
    id: "hls_proxy_retention",
    jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
    jobKey: OPERATOR_MEDIA_HLS_PROXY_ERRORS_RETENTION_JOB_KEY,
    label: "Retention HLS proxy errors",
    scheduleHint: "еженедельно",
    staleAfterSec: 8 * 24 * 60 * 60,
    kind: "internal_http",
    internalPath: "/api/internal/media-hls-proxy-errors/retention",
  },
  {
    id: "product_analytics_retention",
    jobFamily: OPERATOR_ANALYTICS_JOB_FAMILY,
    jobKey: OPERATOR_PRODUCT_ANALYTICS_RETENTION_JOB_KEY,
    label: "Retention продуктовой аналитики",
    scheduleHint: "еженедельно",
    staleAfterSec: 8 * 24 * 60 * 60,
    kind: "internal_http",
    internalPath: "/api/internal/product-analytics/retention",
  },
  {
    id: "specialist_task_reminders_tick",
    jobFamily: OPERATOR_SPECIALIST_TASKS_JOB_FAMILY,
    jobKey: OPERATOR_SPECIALIST_TASK_REMINDERS_TICK_JOB_KEY,
    label: "Напоминания о задачах специалиста",
    scheduleHint: "каждые 5–15 мин",
    staleAfterSec: 30 * 60,
    kind: "internal_http",
    internalPath: "/api/internal/specialist-task-reminders/tick",
  },
  {
    id: "backup_hourly",
    jobFamily: OPERATOR_BACKUP_JOB_FAMILY,
    jobKey: "backup.hourly",
    label: "Бэкап PostgreSQL (hourly)",
    scheduleHint: "ежечасно",
    staleAfterSec: 3 * 60 * 60,
    kind: "backup_shell",
  },
  {
    id: "backup_daily",
    jobFamily: OPERATOR_BACKUP_JOB_FAMILY,
    jobKey: "backup.daily",
    label: "Бэкап PostgreSQL (daily)",
    scheduleHint: "ежедневно",
    staleAfterSec: 28 * 60 * 60,
    kind: "backup_shell",
    optionalNoData: true,
  },
  {
    id: "backup_weekly",
    jobFamily: OPERATOR_BACKUP_JOB_FAMILY,
    jobKey: "backup.weekly",
    label: "Бэкап PostgreSQL (weekly)",
    scheduleHint: "еженедельно",
    staleAfterSec: 8 * 24 * 60 * 60,
    kind: "backup_shell",
    optionalNoData: true,
  },
  {
    id: "backup_prune",
    jobFamily: OPERATOR_BACKUP_JOB_FAMILY,
    jobKey: "backup.prune",
    label: "Бэкап PostgreSQL (prune)",
    scheduleHint: "по расписанию retention",
    staleAfterSec: 8 * 24 * 60 * 60,
    kind: "backup_shell",
    optionalNoData: true,
  },
] as const;

export function findCronJobRegistryEntry(
  jobFamily: string,
  jobKey: string,
): CronJobRegistryEntry | undefined {
  return CRON_JOB_REGISTRY.find((e) => e.jobFamily === jobFamily && e.jobKey === jobKey);
}
