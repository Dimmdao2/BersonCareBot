/** Canonical keys for periodic job ticks in `public.operator_job_status` (mirror integrator schema if applicable). */
export const OPERATOR_MEDIA_JOB_FAMILY = "media";
export const OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY = "media_transcode.reconcile";
export const OPERATOR_MEDIA_PENDING_DELETE_PURGE_JOB_KEY = "media.pending_delete.purge";
export const OPERATOR_MEDIA_MULTIPART_CLEANUP_JOB_KEY = "media.multipart.cleanup";
export const OPERATOR_MEDIA_PREVIEW_PROCESS_JOB_KEY = "media.preview.process";
export const OPERATOR_MEDIA_PLAYBACK_STATS_RETENTION_JOB_KEY = "media.playback_stats.retention";
export const OPERATOR_MEDIA_HLS_PROXY_ERRORS_RETENTION_JOB_KEY = "media.hls_proxy_errors.retention";

export const OPERATOR_ANALYTICS_JOB_FAMILY = "analytics";
export const OPERATOR_PRODUCT_ANALYTICS_RETENTION_JOB_KEY = "analytics.product_analytics.retention";

export const OPERATOR_HEALTH_JOB_FAMILY = "health";
export const OPERATOR_SYSTEM_HEALTH_GUARD_TICK_JOB_KEY = "health.system_health_guard.tick";
export const OPERATOR_HEALTH_CRITICAL_TICK_JOB_KEY = "health.operator_health_critical.tick";
export const OPERATOR_HEALTH_DIGEST_TICK_JOB_KEY = "health.operator_health_digest.tick";
export const OPERATOR_OUTBOUND_PROBE_JOB_KEY = "health.outbound_probe.run";

export const OPERATOR_BACKUP_JOB_FAMILY = "backup";

export const OPERATOR_REMINDERS_JOB_FAMILY = "reminders";
export const OPERATOR_WEB_PUSH_ONLY_REMINDER_TICK_JOB_KEY = "reminders.web_push_only.tick";

export const OPERATOR_SPECIALIST_TASKS_JOB_FAMILY = "specialist_tasks";
export const OPERATOR_SPECIALIST_TASK_REMINDERS_TICK_JOB_KEY = "specialist_task_reminders.tick";
