/**
 * CENSUS OF EVERY JOURNAL / QUEUE / ATTEMPT / TEMP STORE, and the executable gate that keeps it
 * complete (systemic residual audit 2026-08-27, stage 3).
 *
 * Lives next to `declaration.ts`, the artifact it is derived from and checked against: this file is a
 * DECLARATION of data lifecycle, not runtime code. (It also must not sit under an `apps` source root, where
 * the production relation census would read its table names as callsites.)
 *
 * The defect this closes is not "one table was forgotten". It is that the retention policy of
 * 2026-08-08 was written from the tables that were BIG at that moment
 * (`docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/16-journal-retention.md`), so a small-but-growing
 * store — `message_log` (§E1), the consolidated `reminder_occurrence_history` (§C3) — could be added,
 * wired to a live writer, and never appear in any policy at all. Nothing in the build noticed.
 *
 * The gate (`journalLifecycleRegistry.contract.test.ts`) derives the CANDIDATE set mechanically from
 * `deploy/postgres/privileges/declaration.ts` — the one place a physical table must be declared before
 * its migration may exist — and refuses any candidate that has no entry here. So a new
 * `*_events` / `*_log` / `*_queue` / `*_sessions` / … table cannot land without a human writing down:
 * why it exists, its canonical user key and org key, what a full account purge does to it, its
 * terminal states, its retention decision, its named prune root, its sweeping job (which carries the
 * schedule and the staleness/health signal through `CRON_JOB_REGISTRY`).
 *
 * `retention.kind: 'owner-question'` is a legitimate, RECORDED decision — "we asked, we are waiting" —
 * and is deliberately distinguishable from silence, which is what the audit found.
 */

/** How a full account purge reaches the rows of one physical store. */
export type JournalLifecycleUserPurge =
  /** FK to `platform_users` with ON DELETE CASCADE — the DB removes the rows. */
  | { kind: 'cascade'; column: string }
  /** No cascading FK: `platformUserFullPurge` must name the table explicitly. */
  | { kind: 'explicit-delete'; column: string }
  /** FK with ON DELETE SET NULL — the row survives, de-identified, on purpose. */
  | { kind: 'anonymised'; column: string }
  /** Keyed by the phone number, purged by phone in the same transaction. */
  | { kind: 'phone-keyed'; column: string }
  /** Reaches the user only through a parent row that itself cascades from `platform_users`. */
  | { kind: 'via-parent'; parent: string }
  /** Holds no personal owner at all (infra / platform-level fact). */
  | { kind: 'not-user-scoped' };

export type JournalLifecycleOrgPurge =
  | { kind: 'organization_id' }
  | { kind: 'via-parent'; parent: string }
  | { kind: 'not-org-scoped' };

export type JournalLifecycleRetention =
  /** Age-based sweep with a decided window and a named prune root target label. */
  | { kind: 'window'; days: number; pruneTarget: string; basis: string }
  /** Row lifetime is its own TTL column; the sweep only removes rows the readers already ignore. */
  | { kind: 'expiry-column'; pruneTarget: string; basis: string }
  /** The rows die with their parent row and cannot grow on their own. */
  | { kind: 'bounded-by-parent'; basis: string }
  /** Deliberately never aged out (audit trail, or one row per key). */
  | { kind: 'keep-forever'; basis: string }
  /** Recorded open question — mechanics ready, number missing. NOT the same as silence. */
  | { kind: 'owner-question'; id: string; basis: string };

export type JournalLifecycleEntry = {
  /** Schema-qualified physical relation, exactly as declared in `declaration.ts`. */
  table: string;
  /** Why the store exists at all. */
  why: string;
  userPurge: JournalLifecycleUserPurge;
  orgPurge: JournalLifecycleOrgPurge;
  /** States after which a row is finished work. `[]` means the store is append-only by nature. */
  terminalStates: readonly string[];
  retention: JournalLifecycleRetention;
  /**
   * Further prune-root target labels of the SAME store when its terminal states have different
   * windows (`outgoing_delivery_queue`: sent 30d, dead 180d).
   */
  alsoPruneTargets?: readonly string[];
  /**
   * `CRON_JOB_REGISTRY.jobKey` of the job that actually sweeps it — that registry entry carries the
   * schedule hint AND the staleness threshold the operator health card reds out on. `null` only when
   * the retention decision needs no sweep.
   */
  sweptBy: string | null;
};

const DB_JOURNAL_RETENTION_JOB = 'maintenance.db_journal_retention.tick';
const PRODUCT_ANALYTICS_RETENTION_JOB = 'analytics.product_analytics.retention';
const MEDIA_HLS_PROXY_ERRORS_RETENTION_JOB = 'media.hls_proxy_errors.retention';
const MEDIA_PLAYBACK_STATS_RETENTION_JOB = 'media.playback_stats.retention';
const MEDIA_PENDING_DELETE_PURGE_JOB = 'media.pending_delete.purge';
const MEDIA_MULTIPART_CLEANUP_JOB = 'media.multipart.cleanup';

const EVIDENCE_16 = 'evidence/16-journal-retention.md "Правила хранения"';

export const JOURNAL_LIFECYCLE_REGISTRY: readonly JournalLifecycleEntry[] = [
  // ── swept today by the one db_journal_retention tick ────────────────────────────────────────────
  {
    table: 'app.context_nonce_ledger',
    why: 'replay protection for a signed principal context',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: ['expired'],
    retention: {
      kind: 'expiry-column',
      pruneTarget: 'app.prune_context_nonce_ledger',
      basis: `${EVIDENCE_16}: signature TTL is 30s, hard cap 300s; 1h grace`,
    },
    sweptBy: DB_JOURNAL_RETENTION_JOB,
  },
  {
    table: 'public.idempotency_keys',
    why: 'cached inter-service API responses, keyed by request',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: ['expired'],
    retention: {
      kind: 'expiry-column',
      pruneTarget: 'public_idempotency_keys',
      basis: `${EVIDENCE_16}: read is gated on expires_at; +24h support window`,
    },
    sweptBy: DB_JOURNAL_RETENTION_JOB,
  },
  {
    table: 'integrator.idempotency_keys',
    why: 'same idempotency cache on the integrator side',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: ['expired'],
    retention: {
      kind: 'expiry-column',
      pruneTarget: 'integrator_idempotency_keys',
      basis: `${EVIDENCE_16}: expired rows are overwritten, never read`,
    },
    sweptBy: DB_JOURNAL_RETENTION_JOB,
  },
  {
    table: 'public.outgoing_delivery_queue',
    why: 'CANONICAL delivery lifecycle: one row per outgoing message, from pending to sent/dead',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: ['sent', 'dead'],
    retention: {
      kind: 'window',
      days: 30,
      pruneTarget: 'outgoing_delivery_queue_sent',
      basis: `${EVIDENCE_16}: sent 30d by sent_at, dead 180d by dead_at; live statuses never pruned`,
    },
    alsoPruneTargets: ['outgoing_delivery_queue_dead'],
    sweptBy: DB_JOURNAL_RETENTION_JOB,
  },
  {
    table: 'public.notification_delivery_attempts',
    why: 'FAILURE-ONLY journal of real provider calls that failed (Track D #987)',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: ['failed', 'skipped'],
    retention: {
      kind: 'window',
      days: 180,
      pruneTarget: 'notification_delivery_attempts',
      basis: `${EVIDENCE_16}: feeds period-over-period delivery diagnostics; carries no message text`,
    },
    sweptBy: DB_JOURNAL_RETENTION_JOB,
  },
  {
    table: 'public.message_log',
    why: 'doctor→patient message journal: the text actually sent, plus its delivery error',
    userPurge: { kind: 'anonymised', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: ['sent', 'partial', 'failed'],
    retention: {
      kind: 'window',
      days: 90,
      pruneTarget: 'message_log',
      basis:
        `${EVIDENCE_16}: the class "journal carrying the content of a message sent to a person" is ` +
        'already defined at 90d by integrator.delivery_attempt_logs and public.support_delivery_events',
    },
    sweptBy: DB_JOURNAL_RETENTION_JOB,
  },
  {
    table: 'public.reminder_occurrence_history',
    why: 'the ONE occurrence store after the Track D consolidation: operational lifecycle plus the '
      + 'patient facts (seen/snoozed/skipped/done)',
    userPurge: { kind: 'explicit-delete', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: ['sent', 'failed', 'skipped'],
    retention: {
      kind: 'owner-question',
      id: 'OQ-REMINDER-HISTORY-WINDOW',
      basis:
        'No accepted policy names a window: evidence/16 predates the consolidation and PR-03 retention '
        + 'matrix is still an open owner checkbox. Branch, bounded batch, named root, declared surface '
        + 'and scheduler seam are in place; only the number is missing.',
    },
    sweptBy: DB_JOURNAL_RETENTION_JOB,
  },

  // ── swept by the analytics / media retention ticks ──────────────────────────────────────────────
  {
    table: 'public.product_analytics_events_recent',
    why: 'raw product analytics events',
    userPurge: { kind: 'anonymised', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'window',
      days: 90,
      pruneTarget: 'product_analytics_events_recent',
      basis: 'productAnalyticsRetention.ts PRODUCT_ANALYTICS_RECENT_RETENTION_DAYS',
    },
    sweptBy: PRODUCT_ANALYTICS_RETENTION_JOB,
  },
  {
    table: 'public.product_analytics_user_hourly',
    why: 'per-user hourly analytics rollup',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'window',
      days: 180,
      pruneTarget: 'product_analytics_user_hourly',
      basis: 'productAnalyticsRetention.ts PRODUCT_ANALYTICS_USER_HOURLY_RETENTION_DAYS',
    },
    sweptBy: PRODUCT_ANALYTICS_RETENTION_JOB,
  },
  {
    table: 'public.product_analytics_hourly',
    why: 'platform hourly analytics rollup (no user column)',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'window',
      days: 730,
      pruneTarget: 'product_analytics.retention:hourly',
      basis: 'productAnalyticsRetention.ts PRODUCT_ANALYTICS_HOURLY_RETENTION_DAYS',
    },
    sweptBy: PRODUCT_ANALYTICS_RETENTION_JOB,
  },
  {
    table: 'public.product_push_notifications',
    why: 'push send facts, used to attribute an app open to a push',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'window',
      days: 730,
      pruneTarget: 'product_push_notifications',
      basis: 'productAnalyticsRetention.ts PRODUCT_ANALYTICS_PUSH_RETENTION_DAYS',
    },
    sweptBy: PRODUCT_ANALYTICS_RETENTION_JOB,
  },
  {
    table: 'public.media_hls_proxy_error_events',
    why: 'HLS proxy failures, for playback diagnostics',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'window',
      days: 30,
      pruneTarget: 'media_hls_proxy_error_events',
      basis: 'mediaHlsProxyErrorRetention module window',
    },
    sweptBy: MEDIA_HLS_PROXY_ERRORS_RETENTION_JOB,
  },
  {
    table: 'public.media_playback_stats_hourly',
    why: 'hourly playback rollup behind the media health card',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'window',
      days: 400,
      pruneTarget: 'media_playback_stats.retention:hourly',
      basis: 'mediaPlaybackStatsRetention module window',
    },
    sweptBy: MEDIA_PLAYBACK_STATS_RETENTION_JOB,
  },
  {
    table: 'public.media_playback_resolution_events',
    why: 'raw playback resolution events feeding the hourly rollup',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'window',
      days: 30,
      pruneTarget: 'media_playback_stats.retention:events',
      basis: 'mediaPlaybackStatsRetention module window',
    },
    sweptBy: MEDIA_PLAYBACK_STATS_RETENTION_JOB,
  },
  {
    table: 'public.media_playback_client_events',
    why: 'client-side playback errors (hls_fatal, video_error, …)',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'window',
      days: 30,
      pruneTarget: 'media_playback_stats.retention:client_events',
      basis: 'mediaPlaybackStatsRetention module window',
    },
    sweptBy: MEDIA_PLAYBACK_STATS_RETENTION_JOB,
  },

  // ── temp upload / media lifecycle ───────────────────────────────────────────────────────────────
  {
    table: 'public.media_upload_sessions',
    why: 'the multipart upload state machine: it is the ONLY holder of the S3 retry identity '
      + '(s3_key + upload_id) for an unfinished upload',
    userPurge: { kind: 'cascade', column: 'owner_user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: ['completed', 'aborted', 'expired', 'failed'],
    retention: {
      kind: 'owner-question',
      id: 'OQ-TERMINAL-UPLOAD-SESSION-WINDOW',
      basis:
        'Audit §E2: terminal sessions currently disappear only with their media_id. Whether they get '
        + 'their own window is an explicit owner question — adding them to a purge before the answer '
        + 'would delete the retry identity of an upload whose S3 abort has not been confirmed.',
    },
    sweptBy: MEDIA_MULTIPART_CLEANUP_JOB,
  },
  {
    table: 'public.media_files',
    why: 'media library content — but `pending` (upload not finished) and `pending_delete`/`deleting` '
      + 'are TEMPORARY states with their own cleanup owner, which is why the row is listed here',
    userPurge: { kind: 'anonymised', column: 'uploaded_by' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: ['ready', 'pending_delete', 'deleting'],
    retention: {
      kind: 'bounded-by-parent',
      basis:
        'Ready rows are product content and are never aged out. The temporary states are: an '
        + 'abandoned single-PUT `pending` row is staged by stageStaleSinglePutMediaForPurge, an '
        + 'expired multipart one by /api/internal/media-multipart/cleanup, and both are drained by '
        + 'the ONE pending-delete purge with delete_attempts/next_attempt_at backoff (audit §D1/§D2).',
    },
    sweptBy: MEDIA_PENDING_DELETE_PURGE_JOB,
  },
  {
    table: 'public.media_transcode_jobs',
    why: 'video transcode work items',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'via-parent', parent: 'public.media_files' },
    terminalStates: ['done', 'failed'],
    retention: {
      kind: 'bounded-by-parent',
      basis: 'one row per media file; dies with the media row through its FK',
    },
    sweptBy: null,
  },

  // ── auth / rate-limit temp stores: own TTL column, no independent growth ────────────────────────
  {
    table: 'public.phone_challenges',
    why: 'phone OTP challenge in flight',
    userPurge: { kind: 'phone-keyed', column: 'phone' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: ['consumed', 'expired'],
    retention: {
      kind: 'expiry-column',
      pruneTarget: 'phone-otp door: expired rows are refused and overwritten in place',
      basis: 'single row per phone, replaced on every new challenge',
    },
    sweptBy: null,
  },
  {
    table: 'public.phone_otp_locks',
    why: 'lockout counter after failed phone OTP attempts',
    userPurge: { kind: 'phone-keyed', column: 'phone_normalized' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: ['released'],
    retention: {
      kind: 'expiry-column',
      pruneTarget: 'phone-otp door: one row per phone, reset on success',
      basis: 'bounded by the number of distinct phones, not by time',
    },
    sweptBy: null,
  },
  {
    table: 'public.email_challenges',
    why: 'email OTP challenge in flight',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: ['consumed', 'expired'],
    retention: {
      kind: 'expiry-column',
      pruneTarget: 'email-otp door: expired rows are refused and replaced',
      basis: 'one row per user/email, replaced on every new challenge',
    },
    sweptBy: null,
  },
  {
    table: 'public.email_otp_locks',
    why: 'lockout counter after failed email OTP attempts',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: ['released'],
    retention: {
      kind: 'expiry-column',
      pruneTarget: 'email-otp door: one row per identifier, reset on success',
      basis: 'bounded by the number of distinct identifiers, not by time',
    },
    sweptBy: null,
  },
  {
    table: 'public.password_altcha_challenges',
    why: 'proof-of-work challenge for the password door',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: ['consumed', 'expired'],
    retention: {
      kind: 'expiry-column',
      pruneTarget: 'password door: single-use rows consumed or refused after expiry',
      basis: 'consumed on first use; expired rows are refused',
    },
    sweptBy: null,
  },
  {
    table: 'public.user_passkey_challenges',
    why: 'WebAuthn challenge in flight',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: ['consumed', 'expired'],
    retention: {
      kind: 'expiry-column',
      pruneTarget: 'passkey door: single-use rows consumed or refused after expiry',
      basis: 'consumed on first use; expired rows are refused',
    },
    sweptBy: null,
  },
  {
    table: 'public.login_tokens',
    why: 'one-time magic-link login token',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: ['used', 'expired'],
    retention: {
      kind: 'expiry-column',
      pruneTarget: 'login-token door: single-use rows consumed or refused after expiry',
      basis: 'consumed on first use; expired rows are refused',
    },
    sweptBy: null,
  },
  {
    table: 'public.user_email_setup_tokens',
    why: 'one-time token for binding an email address',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: ['used', 'expired'],
    retention: {
      kind: 'expiry-column',
      pruneTarget: 'email-setup door: single-use rows consumed or refused after expiry',
      basis: 'consumed on first use; expired rows are refused',
    },
    sweptBy: null,
  },
  {
    table: 'public.auth_rate_limit_events',
    why: 'sliding-window counter behind the auth rate limiter',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: [],
    retention: {
      kind: 'expiry-column',
      pruneTarget: 'auth rate limiter: the limiter itself drops rows outside its window',
      basis: 'the limiter reads and trims its own window on every check',
    },
    sweptBy: null,
  },

  // ── operator health / observability ─────────────────────────────────────────────────────────────
  {
    table: 'public.operator_job_status',
    why: 'last tick of each background job — the staleness signal itself',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: [],
    retention: {
      kind: 'keep-forever',
      basis: 'exactly one row per (job_family, job_key), updated in place; it cannot grow',
    },
    sweptBy: null,
  },
  {
    table: 'public.operator_incidents',
    why: 'open/closed operator incidents behind the health card and alerts',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: ['resolved'],
    retention: {
      kind: 'bounded-by-parent',
      basis: 'deduplicated by dedup_key and archived by app.archive_operator_health_failures',
    },
    sweptBy: null,
  },
  {
    table: 'public.operator_health_failure_archive',
    why: 'archived operator failures kept out of the live incident table',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: [],
    retention: {
      kind: 'window',
      days: 30,
      pruneTarget: 'app.archive_operator_health_failures',
      basis: 'healthFailureArchiveConstants.ts window, applied by the archive root itself',
    },
    sweptBy: 'health.operator_health_critical.tick',
  },
  {
    table: 'public.operator_health_alert_sent',
    why: 'dedup ledger of alerts already delivered (also the digest heartbeat source)',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: [],
    retention: {
      kind: 'bounded-by-parent',
      basis: 'one row per dedup_key per alert; bounded by the incident set it dedups',
    },
    sweptBy: null,
  },
  {
    table: 'public.integration_webhook_last_status',
    why: 'last webhook result per source, for the integrations health card',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: [],
    retention: {
      kind: 'keep-forever',
      basis: 'exactly one row per source, updated in place',
    },
    sweptBy: null,
  },
  {
    table: 'public.integration_webhook_error_events',
    why: 'webhook error burst detection',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: [],
    retention: {
      kind: 'owner-question',
      id: 'OQ-WEBHOOK-ERROR-EVENTS-WINDOW',
      basis:
        'Only read inside a minutes-wide burst window (listWebhookBurstSignals), so nothing needs the '
        + 'old rows — but no accepted policy names the number, and evidence/16 never listed the table.',
    },
    sweptBy: null,
  },
  {
    table: 'public.saas_isolation_events',
    why: 'tenant-isolation telemetry events',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'owner-question',
      id: 'OQ-SAAS-ISOLATION-EVENTS-WINDOW',
      basis:
        'Rolled up into saas_isolation_event_hourly; the raw table has no declared window and no sweep. '
        + 'Not in evidence/16 (it did not exist yet).',
    },
    sweptBy: null,
  },
  {
    table: 'public.saas_isolation_event_hourly',
    why: 'hourly rollup of tenant-isolation telemetry',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'owner-question',
      id: 'OQ-SAAS-ISOLATION-EVENTS-WINDOW',
      basis: 'same open question as the raw event table it rolls up',
    },
    sweptBy: null,
  },
  {
    table: 'public.saas_isolation_coverage_runs',
    why: 'one row per isolation-coverage run',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: ['completed'],
    retention: {
      kind: 'owner-question',
      id: 'OQ-SAAS-ISOLATION-EVENTS-WINDOW',
      basis: 'same open question as the isolation telemetry it summarises',
    },
    sweptBy: null,
  },

  // ── audit trails: deliberately never aged out ───────────────────────────────────────────────────
  {
    table: 'public.admin_audit_log',
    why: 'who did which administrative action',
    userPurge: { kind: 'anonymised', column: 'actor_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'keep-forever',
      basis: `${EVIDENCE_16}: deleting an audit trail on a schedule is what an audit trail must prevent`,
    },
    sweptBy: null,
  },
  {
    table: 'public.system_settings_audit',
    why: 'who changed which runtime setting',
    userPurge: { kind: 'anonymised', column: 'changed_by' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'keep-forever',
      basis: `${EVIDENCE_16} row for app_runtime_settings_audit: audit trails are not swept`,
    },
    sweptBy: null,
  },
  {
    table: 'public.broadcast_audit',
    why: 'record of a doctor broadcast: audience, counters, errors',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: ['done', 'failed'],
    retention: {
      kind: 'keep-forever',
      basis: 'evidence that a clinic-wide message was sent, and to how many people',
    },
    sweptBy: null,
  },
  {
    table: 'public.broadcast_audit_recipients',
    why: 'per-recipient rows of one broadcast',
    userPurge: { kind: 'cascade', column: 'platform_user_id' },
    orgPurge: { kind: 'via-parent', parent: 'public.broadcast_audit' },
    terminalStates: [],
    retention: {
      kind: 'bounded-by-parent',
      basis: 'dies with its broadcast_audit row',
    },
    sweptBy: null,
  },
  {
    table: 'public.organization_slug_rename_events',
    why: 'history of public slug renames (old links must stay explainable)',
    userPurge: { kind: 'anonymised', column: 'actor_platform_user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'keep-forever',
      basis: 'a released slug must remain traceable to the organization that held it',
    },
    sweptBy: null,
  },
  {
    table: 'public.content_section_slug_history',
    why: 'previous slugs of a content section, so old links keep resolving',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'keep-forever',
      basis: 'the row IS the redirect; deleting it breaks a published link',
    },
    sweptBy: null,
  },
  {
    table: 'public.user_phone_history',
    why: 'previous phone numbers of one account (merge/rebinding evidence)',
    userPurge: { kind: 'cascade', column: 'platform_user_id' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: [],
    retention: {
      kind: 'bounded-by-parent',
      basis: 'dies with the account; bounded by how often one person changes phone',
    },
    sweptBy: null,
  },

  // ── clinical / product histories: patient record, not a journal to age out ──────────────────────
  {
    table: 'public.be_appointment_events',
    why: 'appointment state changes',
    userPurge: { kind: 'via-parent', parent: 'public.be_appointments' },
    orgPurge: { kind: 'via-parent', parent: 'public.be_appointments' },
    terminalStates: [],
    retention: {
      kind: 'bounded-by-parent',
      basis: 'dies with its appointment row',
    },
    sweptBy: null,
  },
  {
    table: 'public.be_appointment_history_events',
    why: 'human-readable appointment history shown in the cabinet',
    userPurge: { kind: 'anonymised', column: 'actor_id' },
    orgPurge: { kind: 'via-parent', parent: 'public.be_appointments' },
    terminalStates: [],
    retention: { kind: 'bounded-by-parent', basis: 'dies with its appointment row' },
    sweptBy: null,
  },
  {
    table: 'public.be_patient_timeline_events',
    why: 'patient timeline in the doctor cabinet',
    userPurge: { kind: 'cascade', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: { kind: 'bounded-by-parent', basis: 'dies with the patient account' },
    sweptBy: null,
  },
  {
    table: 'public.be_package_history_events',
    why: 'package purchase/usage history',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'via-parent', parent: 'public.be_patient_packages' },
    terminalStates: [],
    retention: { kind: 'bounded-by-parent', basis: 'dies with its package row' },
    sweptBy: null,
  },
  {
    table: 'public.be_payment_history_events',
    why: 'payment state history',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'via-parent', parent: 'public.be_payments' },
    terminalStates: [],
    retention: {
      kind: 'keep-forever',
      basis: 'money: the trail of a payment is kept for as long as the payment is kept',
    },
    sweptBy: null,
  },
  {
    table: 'public.be_payment_provider_events',
    why: 'raw callbacks from the payment provider',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'via-parent', parent: 'public.be_payments' },
    terminalStates: [],
    retention: {
      kind: 'keep-forever',
      basis: 'money: provider callbacks are the external evidence of a charge',
    },
    sweptBy: null,
  },
  {
    table: 'public.saas_billing_provider_events',
    why: 'raw callbacks from the subscription payment provider',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: { kind: 'keep-forever', basis: 'money: same class as be_payment_provider_events' },
    sweptBy: null,
  },
  {
    table: 'public.clinical_diagnosis_status_history',
    why: 'status changes of a clinical diagnosis',
    userPurge: { kind: 'anonymised', column: 'changed_by' },
    orgPurge: { kind: 'via-parent', parent: 'public.clinical_diagnosis' },
    terminalStates: [],
    retention: { kind: 'bounded-by-parent', basis: 'dies with its diagnosis row' },
    sweptBy: null,
  },
  {
    table: 'public.online_intake_status_history',
    why: 'status changes of an online intake request',
    userPurge: { kind: 'anonymised', column: 'changed_by' },
    orgPurge: { kind: 'via-parent', parent: 'public.online_intake_requests' },
    terminalStates: [],
    retention: { kind: 'bounded-by-parent', basis: 'dies with its intake request' },
    sweptBy: null,
  },
  {
    table: 'public.treatment_program_events',
    why: 'treatment program state changes',
    userPurge: { kind: 'anonymised', column: 'actor_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'bounded-by-parent',
      basis: 'dies with its program instance; part of the patient record',
    },
    sweptBy: null,
  },
  {
    table: 'public.program_action_log',
    why: 'what the patient actually did inside a treatment program',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'bounded-by-parent',
      basis: 'adherence evidence the doctor reads; dies with the patient account',
    },
    sweptBy: null,
  },
  {
    table: 'public.lfk_sessions',
    why: 'one recorded exercise session of a patient',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'bounded-by-parent',
      basis: 'patient diary content, not a journal; dies with the patient account',
    },
    sweptBy: null,
  },
  {
    table: 'public.test_attempts',
    why: 'one attempt of a clinical test by a patient',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: ['accepted'],
    retention: {
      kind: 'bounded-by-parent',
      basis: 'clinical result, not a journal; dies with the patient account',
    },
    sweptBy: null,
  },
] as const;

/** Fast lookup used by the gate and by anything that needs one table's policy. */
export function findJournalLifecycleEntry(table: string): JournalLifecycleEntry | undefined {
  return JOURNAL_LIFECYCLE_REGISTRY.find((entry) => entry.table === table);
}

/**
 * Mechanical trigger for the gate: the shapes that ARE journals/queues/attempt logs/temp stores in
 * this repository's naming. A declared table matching one of these must carry a lifecycle decision.
 * Widening this list is cheap; narrowing it needs a reason.
 */
export const JOURNAL_LIFECYCLE_TABLE_SUFFIXES: readonly string[] = [
  '_log',
  '_logs',
  '_event',
  '_events',
  '_attempts',
  '_queue',
  '_job',
  '_jobs',
  '_history',
  '_audit',
  '_session',
  '_sessions',
  '_ledger',
  '_outbox',
  '_keys',
  '_locks',
  '_challenges',
  '_tokens',
  '_recent',
  '_hourly',
  '_status',
  '_runs',
];

/**
 * Journal/temp stores whose names do not match the suffix trigger. Listed by name so the census is
 * complete even where the naming is not mechanical.
 */
export const JOURNAL_LIFECYCLE_EXTRA_CANDIDATES: readonly string[] = [
  'public.media_files',
  'public.operator_incidents',
  'public.operator_health_alert_sent',
  'public.operator_health_failure_archive',
  'public.product_push_notifications',
  'public.media_playback_client_events',
  'public.media_playback_resolution_events',
];

/**
 * Declared tables that MATCH the suffix trigger but are not journals or temp stores, each with the
 * reason. Anything not here and not in the registry fails the gate.
 */
export const JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS: Readonly<Record<string, string>> = {
  'drizzle.__drizzle_migrations': 'applied-migration ledger; identity of the schema itself',
  'integrator.schema_migrations': 'applied-migration ledger of the integrator schema',
  'public.schema_migrations': 'applied-migration ledger',
  'public.webapp_schema_migrations': 'applied-migration ledger',
  'app.context_signing_secrets': 'key material, not a journal; rotated, never aged out',
  'app.principal_context': 'per-connection principal state, dropped with the connection',
  'public.be_appointment_cancellations': 'a cancellation is a booking fact, not a log line',
  'public.be_appointment_no_shows': 'a no-show is a booking fact, not a log line',
  'public.be_appointment_reschedules': 'a reschedule is a booking fact, not a log line',
  'public.be_appointment_staff_comments': 'staff notes on an appointment — clinical content',
  'public.be_booking_form_submissions': 'a submitted booking form is patient-entered content',
  'public.be_working_days': 'schedule configuration',
  'public.be_working_hours': 'schedule configuration',
  'public.be_schedule_blocks': 'schedule configuration',
  'public.be_schedule_templates': 'schedule configuration',
  'public.booking_cities': 'reference data',
  'public.channel_link_secrets': 'messenger binding secret; single-use credential, not a journal',
  'public.phone_messenger_bind_secrets': 'messenger binding secret; single-use credential',
  'public.clinical_test_measure_kinds': 'reference data',
  'public.clinical_test_regions': 'reference data',
  'public.comments': 'user-authored content',
  'public.content_pages': 'published content',
  'public.content_sections': 'published content',
  'public.courses': 'published content',
  'public.lfk_exercise_regions': 'reference data',
  'public.lfk_complex_exercises': 'program composition',
  'public.lfk_complex_template_exercises': 'program composition',
  'public.material_ratings': 'user-authored rating, one row per user/material',
  'public.motivational_quotes': 'reference content',
  'public.org_brand_revisions': 'published brand versions; a revision is content, not a log line',
  'public.organization_slug_claims': 'live claim on a public slug, not history',
  'public.patient_daily_warmup_presentations': 'one row per patient/day presentation decision',
  'public.patient_daily_warmup_video_views': 'one row per patient/video view decision',
  'public.patient_practice_completions': 'patient diary content',
  'public.patient_diary_day_snapshots': 'patient diary content',
  'public.recommendation_regions': 'reference data',
  'public.reference_catalog_baselines': 'versioned reference templates',
  'public.reference_catalog_snapshot_receipts': 'per-organization seeding receipt, one row per org',
  'public.saas_billing_periods': 'reference data',
  'public.saas_organization_trials': 'one trial row per organization',
  'public.specialist_signup_intents': 'a pending signup, resolved or abandoned; not a journal',
  'public.specialist_tasks': 'live task list of a specialist',
  'public.staff_security_profiles': 'one security profile row per staff user',
  'public.system_settings': 'live runtime configuration',
  'public.test_results': 'clinical result rows of one test attempt',
  'public.test_set_items': 'reference composition',
  'public.test_sets': 'reference data',
  'public.tests': 'reference data',
  'public.treatment_program_instance_stage_groups': 'program composition',
  'public.treatment_program_instance_stage_items': 'program composition',
  'public.treatment_program_instance_stages': 'program composition',
  'public.treatment_program_instances': 'assigned program, part of the patient record',
  'public.treatment_program_template_stage_groups': 'template composition',
  'public.treatment_program_template_stage_items': 'template composition',
  'public.treatment_program_template_stages': 'template composition',
  'public.treatment_program_templates': 'reference template',
  'public.user_notification_topics': 'per-user subscription state',
  'public.user_notification_topic_channels': 'per-user channel preference',
  'public.user_passkey_accounts': 'credential state',
  'public.user_passkey_credentials': 'credential state',
  'public.user_password_credentials': 'credential state',
  'public.user_oauth_bindings': 'credential state',
  'public.user_channel_bindings': 'messenger binding state',
  'public.user_pins': 'credential state',
  'public.password_login_identifier_protection': 'per-identifier lockout state, one row per identifier',
  'public.email_send_cooldowns': 'per-user cooldown state, one row per user/kind',
  'public.patient_merge_candidates': 'live merge worklist, resolved in place',
  'integrator.telegram_users': 'retired integrator identity projection',
  'integrator.user_reminder_rules': 'retired integrator reminder-rule projection',
  'integrator.user_questions': 'support question rows of the retired integrator schema',
  'integrator.question_messages': 'support question messages of the retired integrator schema',
  'integrator.conversation_messages': 'support conversation content',
  'integrator.integration_data_quality_incidents': 'live data-quality worklist, resolved in place',
};
