/**
 * CENSUS OF EVERY DECLARED PHYSICAL TABLE, and the executable gate that keeps it complete
 * (systemic residual audit 2026-08-27, stage 3).
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
 * THE CANDIDATE SET IS THE WHOLE DECLARATION. Until 2026-08-28 the gate only looked at names matching a
 * suffix list (`_log`, `_events`, `_queue`, …) plus a hand list of extras. The independent audit
 * (`docs/_TODO/runs/FINAL_SYSTEMIC_LIFECYCLE_AUDIT_2026-08-28.md`, F3) injected
 * `public.bcb_probe_sms_deliveries` into `declaration.ts` and the gate stayed green: a table could be
 * declared, migrated and wired to a live writer with no lifecycle decision at all, purely because its
 * name did not rhyme with a log. `public.manual_patient_commands` was already living in that hole, and
 * it was the table that made every account purge fail (F1). Guessing which names are journals is the
 * defect; there is no heuristic here any more. Every table declared in `declaration.ts` — the one place
 * a physical table must appear before its migration may exist — is in EXACTLY ONE of:
 *
 *   1. `JOURNAL_LIFECYCLE_REGISTRY` — it IS a journal / queue / attempt / temp store, and carries why it
 *      exists, its canonical user key and org key, what a full account purge does to it, its terminal
 *      states, its retention decision, its named prune root, and its sweeping job (which carries the
 *      schedule and the staleness/health signal through `CRON_JOB_REGISTRY`); or
 *   2. `JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS` — it is NOT such a store, and says so with a written
 *      reason PLUS the same explicit account-purge and organization-purge semantics. A bare reason
 *      string is no longer accepted: that escape hatch is how `patient_practice_completions` and
 *      `patient_diary_day_snapshots` were filed as "patient diary content" and silently survived purge
 *      (F2). `not-user-scoped` / `not-org-scoped` are legitimate answers — but they must be WRITTEN.
 *
 * `retention.kind: 'owner-question'` and `userPurge.kind: 'owner-question'` are legitimate, RECORDED
 * decisions — "we asked, we are waiting" — and are deliberately distinguishable from silence, which is
 * what the audit found.
 *
 * A COMPLETE PARTITION IS NOT A TRUE ONE (independent audit
 * `docs/_TODO/runs/FINAL_EXHAUSTIVE_LIFECYCLE_CENSUS_AUDIT_2026-08-28.md`). The first exhaustive pass
 * classified every declared table exactly once and was still wrong in five places, because a written
 * decision is not evidence for itself: `notification_delivery_attempts` said the person lived in ONE
 * column when it lived in three (F1); `auth_rate_limit_events` and `be_specialists` said
 * `not-user-scoped` over live raw account uuids (F2); four `organization_id` claims named an
 * organization purge the database would refuse or silently skip (F3); and a decided window pointed at
 * a root that moves rows INTO the store instead of pruning it (F4). Every entry here is therefore
 * measured against something outside this file — the live `pg_constraint` graph, `CONTENT_TABLES` /
 * `ANONYMISE_ON_PURGE_COLUMNS` of the one purge core, the declared installed callables of
 * `declaration.ts`, and `CRON_JOB_REGISTRY` — by
 * `apps/webapp/src/modules/db-retention/journalLifecycleRegistry.contract.test.ts` and, physically,
 * by `apps/webapp/src/infra/platformUserFullPurge.devDbProof.test.ts`.
 *
 * Current partition: 221 declared physical tables = 57 registry entries + 164 structured decisions.
 * (`public.user_email_setup_tokens` left the declaration on 2026-08-28: it existed in no managed
 * database and had no writer, reader or human path, so it was a policy for nothing — see the comment
 * where its row used to be in `declaration.ts`.)
 */


/** How a full account purge reaches the rows of one physical store. */
export type JournalLifecycleUserPurge =
  /** FK to `platform_users` with ON DELETE CASCADE — the DB removes the rows. */
  | { kind: 'cascade'; column: string }
  /** No cascading FK: `platformUserFullPurge` must name the table explicitly. */
  | { kind: 'explicit-delete'; column: string }
  /**
   * The row IS deleted by the purge, but AFTER the transaction commits, because the row is the last
   * handle on an external object that must be destroyed first (audit §D1: dropping the retry
   * identity before a confirmed S3 delete loses the object forever). The purge core only COLLECTS
   * its keys — `collectPurgeArtifactKeys` — and `runStrictPurgePlatformUser` deletes the row once
   * the object is gone. `basis` must name both halves; a plain `explicit-delete` here would be a
   * false statement, because `CONTENT_TABLES` deliberately does not contain the table.
   */
  | { kind: 'deferred-delete'; column: string; basis: string }
  /**
   * No cascading FK, and the ROW is not the purged person's own data (e.g. a specialist's task that
   * merely references a patient) — so the reference column is nulled, not the row deleted.
   * `platformUserFullPurge.ANONYMISE_ON_PURGE_COLUMNS` must name the table+column explicitly. Mirrors
   * `explicit-delete`; distinct from `anonymised` below, which is a live FK doing the same thing.
   */
  | { kind: 'explicit-anonymise'; column: string }
  /** FK with ON DELETE SET NULL — the row survives, de-identified, on purpose. */
  | { kind: 'anonymised'; column: string }
  /** Keyed by the phone number, purged by phone in the same transaction. */
  | { kind: 'phone-keyed'; column: string }
  /** Reaches the user only through a parent row that itself cascades from `platform_users`. */
  | { kind: 'via-parent'; parent: string }
  /**
   * The only user reference the row carries is the staff member who authored/updated it.
   * `runStrictPurgePlatformUser` refuses any role other than `client`, so this column is never the
   * purged person. `basis` must say who writes it — a table where a PATIENT can end up in the column
   * is not this kind (`public.comments` is, and its `ON DELETE RESTRICT` is why the basis records the
   * measurement).
   */
  | { kind: 'staff-authored'; column: string; basis: string }
  /**
   * The row carries the user key but is removed by its own TTL / connection release, never by the
   * account purge: short-lived auth and per-connection state. `basis` must name the expiry mechanism.
   */
  | { kind: 'self-expiring'; column: string; basis: string }
  /**
   * The row is an IDENTITY ROOT of another persona that shares the platform user id — today the
   * clinic's specialist card, whose `be_specialists.id` IS a `platform_users.id` with no FK. A
   * client account that also owns such a root is REFUSED by the purge before any destructive work,
   * because deleting the platform identity while the specialist card, schedule and appointments
   * keep the same raw uuid is neither a purge nor a working directory (exhaustive census audit
   * 2026-08-28, F2). `basis` must name the guard that refuses it.
   */
  | { kind: 'purge-blocked'; column: string; basis: string }
  /**
   * Recorded open question — the mechanism is understood, the delete-or-de-identify decision is the
   * owner's and has not been made. NOT the same as silence, and NOT a licence to leave it forever:
   * the id is what the owner answers.
   */
  | { kind: 'owner-question'; id: string; column: string; basis: string }
  /**
   * Declared for cleanup only — the relation exists in no managed database, so no purge reaches it.
   * `basis` must name where that was verified.
   */
  | { kind: 'absent-retired'; basis: string }
  /** Holds no personal owner at all (infra / platform-level fact). */
  | { kind: 'not-user-scoped' };

export type JournalLifecycleOrgPurge =
  | { kind: 'organization_id' }
  /**
   * The clinic reference is NULLED, not deleted, when the organization goes: the row survives as an
   * unlinked tombstone because a released public slug must stay un-reusable and its rename history
   * must stay readable. `basis` must name the FK that performs it (`ON DELETE SET NULL`).
   */
  | { kind: 'org-anonymised'; column: string; basis: string }
  | { kind: 'via-parent'; parent: string }
  /** Same statement as the user-purge variant: the relation exists in no managed database. */
  | { kind: 'absent-retired'; basis: string }
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
    // Exhaustive census 2026-08-28: declared `not-user-scoped`, but `user_id uuid` is a real
    // platform-user reference with no FK and no purge step. The independent audit of the same day
    // (F1) then showed the recorded question was itself false: this row carries the person on TWO
    // live surfaces, not one: `user_id` and the raw uuid embedded in `metadata`.
    // `20260820T185707_the_delivery_journal_accepts_a_nonqueue_attempt.sql` copies
    // `payload.intent.meta.userId` into it while embedding the whole payload under `metadata`, where
    // the raw uuid turns up inside free text (`correlationId`, `callback_data`, message bodies) —
    // so the metadata scrub is textual over the whole document, not a key drop.
    //
    // OWNER DIRECTIVE (brief `docs/_TODO/runs/briefs/FIX_EXHAUSTIVE_LIFECYCLE_SEMANTICS_2026-08-28.md`,
    // finding 1), which ANSWERS and retires `OQ-DELIVERY-ATTEMPT-USER-PURGE`: strip the person from
    // all three surfaces and KEEP the non-identifying delivery outcome until its own 180-day sweep.
    // That is the safe default the census recommended, and the policy already decided for
    // `product_analytics_events_recent` — keep the aggregate, drop the person. It is NOT a delete:
    // no unrelated delivery fact is removed and no second journal is created.
    userPurge: { kind: 'explicit-anonymise', column: 'user_id' },
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
    userPurge: { kind: 'explicit-delete', column: 'platform_user_id' },
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
      pruneTarget: 'analytics.product_analytics.retention:hourly',
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
      days: 90,
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
      days: 90,
      pruneTarget: 'media.playback_stats.retention:hourly',
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
      days: 400,
      pruneTarget: 'media.playback_stats.retention:events',
      basis: 'playbackHourlyRetention.ts PLAYBACK_RAW_EVENTS_RETENTION_DAYS',
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
      days: 400,
      pruneTarget: 'media.playback_stats.retention:client_events',
      basis: 'playbackHourlyRetention.ts PLAYBACK_RAW_EVENTS_RETENTION_DAYS',
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
    // Exhaustive census audit 2026-08-28, F5: `explicit-delete` was false by the letter of its own
    // definition — `CONTENT_TABLES` deliberately does NOT name this table, because deleting the row
    // inside the purge transaction would destroy the last handle on the S3 object before the object
    // itself is gone (§D1). The row IS deleted, after commit, per key, only once its object is
    // confirmed removed.
    userPurge: {
      kind: 'deferred-delete',
      column: 'uploaded_by',
      basis:
        'collectPurgeArtifactKeys() captures every media_files row of the person inside the purge '
        + 'transaction, before the deletes that hide its inputs; runPostCommitArtifactCleanup() in '
        + 'strictPlatformUserPurge.ts deletes each row after its S3 object is confirmed gone.',
    },
    orgPurge: { kind: 'organization_id' },
    terminalStates: ['ready', 'pending_delete', 'deleting'],
    retention: {
      kind: 'bounded-by-parent',
      basis:
        'Ready rows are product content and are never aged out. The temporary states are: an ' +
        'abandoned single-PUT `pending` row and orphan hosted-video covers are staged through the ' +
        'same leased pending-delete DB root; expired multipart uploads join that lifecycle through ' +
        '/api/internal/media-multipart/cleanup. The ONE purge keeps multipart retry identity until ' +
        'confirmed S3 cleanup and uses delete_attempts/next_attempt_at backoff (audit §D1/§D2).',
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
    // Exhaustive census 2026-08-28: the row IS keyed by `user_id` (columns are exactly
    // `user_id, locked_until, lockout_cycle`), so `not-user-scoped` was inaccurate. Nothing in the
    // purge deletes it and nothing needs to: the lock releases itself at `locked_until` and is swept
    // by the expiry-column target below. Measured 0 `role='client'` rows on TEST (read-only).
    userPurge: {
      kind: 'self-expiring',
      column: 'user_id',
      basis: 'released at locked_until and swept by the email_otp_locks expiry target below',
    },
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
    table: 'public.auth_rate_limit_events',
    why: 'sliding-window counter behind the auth rate limiter',
    // Exhaustive census audit 2026-08-28, F2: `not-user-scoped` was false for one scope.
    // `auth.channel_link_start` keys its bucket on the RAW platform uuid
    // (`isChannelLinkStartRateLimited(userId)`), so the key IS the person. Measured read-only:
    // 15 rows carrying 11 distinct `role='client'` uuids on bcb_webapp_dev, the same 15/11 on
    // bersoncarebot_test. `key` is now an explicit purge target of the one purge core; a platform
    // uuid cannot collide with the IP / phone / e-mail keys of the other scopes.
    userPurge: { kind: 'explicit-delete', column: 'key' },
    orgPurge: { kind: 'not-org-scoped' },
    terminalStates: [],
    retention: {
      kind: 'expiry-column',
      pruneTarget: 'auth rate limiter: the limiter itself drops rows outside its window',
      // Same audit, same finding: the DB function only trims `(scope, key)` of the CURRENT call
      // unless the caller asks for a scope-wide prune, and after the last call for a key there is
      // no next call — so an identity-bearing bucket was unbounded, not window-bounded. Every
      // user-keyed scope now configures `scopePrune`, which is the existing bounded, batched
      // `p_scope_retention_ms` / `p_scope_prune_limit` path of
      // `app.auth_rate_limit_check_and_record`.
      basis:
        'the limiter trims its own (scope,key) window on every check, and the user-keyed scopes '
        + '(patient.client_boot_report, auth.channel_link_start) additionally run the bounded '
        + 'scope-wide prune of app.auth_rate_limit_check_and_record — see authRateLimits.ts',
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
    // Exhaustive census audit 2026-08-28, F3: labelled `not-org-scoped` while the live FK
    // `operator_health_failure_archive_organization_id_fkey` is ON DELETE CASCADE — the behaviour
    // was safe, the written statement was not (23 rows on bcb_webapp_dev, 1 organization).
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'window',
      days: 30,
      // Same audit, F4: the archive root MOVES live failures into this table; it does not prune it.
      // The installed root that applies the 30-day window is the one the scheduler really calls
      // (`pruneArchivedOlderThanDays` → `app.prune_operator_health_failure_archive(integer)`).
      pruneTarget: 'app.prune_operator_health_failure_archive',
      basis: 'healthFailureArchiveConstants.ts window, applied by the archive prune root',
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
    // Cross-tenant platform telemetry: the relation has no `organization_id` column at all.
    orgPurge: { kind: 'not-org-scoped' },
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
    // Cross-tenant platform telemetry: the relation has no `organization_id` column at all.
    orgPurge: { kind: 'not-org-scoped' },
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
    // The live FK nulls the clinic instead of cascading: a settings-change audit row must
    // outlive the organization whose settings it records.
    orgPurge: {
      kind: 'org-anonymised',
      column: 'organization_id',
      basis: 'system_settings_audit_organization_id_fkey ON DELETE SET NULL',
    },
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
    // Exhaustive census audit 2026-08-28, F3: `organization_id` was false — the live FK was the
    // default NO ACTION, so live rename rows REFUSED the organization delete outright (2 rows on
    // bcb_webapp_dev). Deleting them instead would erase the proof that a released public slug was
    // ever held, which is the whole reason the table exists, so the clinic reference is nulled and
    // the row survives as an unlinked audit fact.
    orgPurge: {
      kind: 'org-anonymised',
      column: 'organization_id',
      basis:
        'organization_slug_rename_events_organization_id_fkey ON DELETE SET NULL '
        + '(20260828T131900_organization_purge_reaches_every_named_class.sql)',
    },
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
    // Exhaustive census audit 2026-08-28, F3: labelled `not-org-scoped` while the live FK
    // `user_phone_history_organization_id_fkey` is ON DELETE CASCADE (91 rows on bcb_webapp_dev).
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'bounded-by-parent',
      basis: 'dies with the account; bounded by how often one person changes phone',
    },
    sweptBy: null,
  },

  // ── clinical / product histories: patient record, not a journal to age out ──────────────────────
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
    // Exhaustive census 2026-08-28: the declaration said `not-user-scoped`, but the table carries
    // `platform_user_id` and `pgClientHistory.ts` reads it as the PATIENT's payment history. The
    // column has no FK, so the raw id of a purged patient stayed on a row that accounting keeps.
    // Same family policy as `be_payment_intents.platform_user_id`, whose owner-decided FK is
    // ON DELETE SET NULL: keep the financial record, drop the person.
    userPurge: { kind: 'explicit-anonymise', column: 'platform_user_id' },
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
  // Final systemic lifecycle audit 2026-08-28, F2: same class as `lfk_sessions` / `program_action_log`
  // / `test_attempts` above (patient diary content, dies with the patient account), but with NO
  // cascading FK to `platform_users` — so `explicit-delete` via `CONTENT_TABLES`, not `cascade`.
  {
    table: 'public.patient_diary_day_snapshots',
    why: 'immutable daily snapshot of the patient diary (warm-up + plan), one row per patient/day',
    userPurge: { kind: 'explicit-delete', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'bounded-by-parent',
      basis: 'patient diary content, not a journal; dies with the patient account via explicit-delete '
        + '(no cascading FK exists)',
    },
    sweptBy: null,
  },
  {
    table: 'public.patient_practice_completions',
    why: 'one recorded patient practice-completion event (home/reminder/section/daily-warmup)',
    userPurge: { kind: 'explicit-delete', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'bounded-by-parent',
      basis: 'patient diary content, not a journal; dies with the patient account via explicit-delete '
        + '(no cascading FK exists)',
    },
    sweptBy: null,
  },
  // Final systemic lifecycle audit 2026-08-28, F1/F3: declared in `declaration.ts:1119`, matched no
  // suffix and no extra-candidate entry, so it had NO written lifecycle at all. `org_enrollments`
  // cascades away with `platform_users`; this table references `org_enrollments` with the default ON
  // DELETE NO ACTION, so an unpurged row here made the database refuse the whole account purge with
  // `23503` — for every client who ever received a manual command, nothing was deleted at all.
  {
    table: 'public.manual_patient_commands',
    why: 'idempotency ledger for staff-issued manual patient commands (invite, walk-in, …) — the '
      + 'fingerprint dedup key protects against double-executing one command',
    userPurge: { kind: 'explicit-delete', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
    terminalStates: [],
    retention: {
      kind: 'keep-forever',
      basis: 'one row per real staff-issued command, bounded by staff action volume, not by time; no '
        + 'independent growth signal in the audit — explicit-delete on account purge removes it',
    },
    sweptBy: null,
  },
] as const;

/** Fast lookup used by the gate and by anything that needs one table's policy. */
export function findJournalLifecycleEntry(table: string): JournalLifecycleEntry | undefined {
  return JOURNAL_LIFECYCLE_REGISTRY.find((entry) => entry.table === table);
}

/**
 * A declared table that is NOT a journal / queue / attempt / temp store. Structured on purpose:
 *
 *  - `reason` says why it is not such a store;
 *  - `userPurge` / `orgPurge` say what a full account purge and a full organization purge do to it,
 *    in exactly the same vocabulary the lifecycle registry uses.
 *
 * The last two fields exist because the audit of 2026-08-28 (F2) found the previous escape hatch —
 * a bare reason string — being used to file `patient_practice_completions` and
 * `patient_diary_day_snapshots` as "patient diary content" with NO purge decision at all; both
 * silently survived account purge, and both are now lifecycle-registry entries that die with the
 * account. Saying "this holds nobody" is fine; NOT saying it is not.
 */
export type JournalNonJournalDecision = {
  reason: string;
  userPurge: JournalLifecycleUserPurge;
  orgPurge: JournalLifecycleOrgPurge;
};

/**
 * Every declared table that is not in `JOURNAL_LIFECYCLE_REGISTRY`. Together the two cover the whole
 * of `declaration.ts`, with no name heuristic in between — see the file header. A table in neither,
 * or in both, fails `journalLifecycleRegistry.contract.test.ts`.
 *
 * The purge facts here are derived from the live constraint graph of the managed databases (FK to
 * `public.platform_users` and `public.be_organizations` with their `ON DELETE` action), from
 * `platformUserFullPurge.ts` (`CONTENT_TABLES`, `ANONYMISE_ON_PURGE_COLUMNS`, the identity and diary
 * sequences) and from the writer call sites — not from the table names.
 */
export const JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS: Readonly<Record<string, JournalNonJournalDecision>> = {
  'app.context_signing_secrets': {
    reason: 'key material, not a journal; rotated, never aged out',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'app.principal_context': {
    reason: 'per-connection principal state, dropped with the connection',
    userPurge: { kind: 'self-expiring', column: 'patient_user_id', basis: 'row is keyed by backend_pid and carries expires_epoch; app.release_principal_context() drops it when the connection is released' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'drizzle.__drizzle_migrations': {
    reason: 'applied-migration ledger; identity of the schema itself',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'integrator.contacts': {
    reason: 'retired integrator contact projection of the messenger identity',
    userPurge: { kind: 'absent-retired', basis: 'declared for cleanup only: the relation exists in neither managed database (verified on bcb_webapp_dev and bersoncarebot_test)' },
    orgPurge: { kind: 'absent-retired', basis: 'same relation: nothing to purge because nothing exists' },
  },
  'integrator.content_access_grants': {
    reason: 'retired integrator content-access projection',
    userPurge: { kind: 'absent-retired', basis: 'declared for cleanup only: the relation exists in neither managed database (verified on bcb_webapp_dev and bersoncarebot_test)' },
    orgPurge: { kind: 'absent-retired', basis: 'same relation: nothing to purge because nothing exists' },
  },
  'integrator.conversation_messages': {
    reason: 'support conversation content',
    userPurge: { kind: 'absent-retired', basis: 'declared for cleanup only: the relation exists in neither managed database (verified on bcb_webapp_dev and bersoncarebot_test)' },
    orgPurge: { kind: 'absent-retired', basis: 'same relation: nothing to purge because nothing exists' },
  },
  'integrator.conversations': {
    reason: 'retired integrator support-conversation projection',
    userPurge: { kind: 'absent-retired', basis: 'declared for cleanup only: the relation exists in neither managed database (verified on bcb_webapp_dev and bersoncarebot_test)' },
    orgPurge: { kind: 'absent-retired', basis: 'same relation: nothing to purge because nothing exists' },
  },
  'integrator.integration_data_quality_incidents': {
    reason: 'live data-quality worklist, resolved in place',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'integrator.question_messages': {
    reason: 'support question messages of the retired integrator schema',
    userPurge: { kind: 'absent-retired', basis: 'declared for cleanup only: the relation exists in neither managed database (verified on bcb_webapp_dev and bersoncarebot_test)' },
    orgPurge: { kind: 'absent-retired', basis: 'same relation: nothing to purge because nothing exists' },
  },
  'integrator.schema_migrations': {
    reason: 'applied-migration ledger of the integrator schema',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'integrator.telegram_users': {
    reason: 'retired integrator identity projection',
    userPurge: { kind: 'absent-retired', basis: 'declared for cleanup only: the relation exists in neither managed database (verified on bcb_webapp_dev and bersoncarebot_test)' },
    orgPurge: { kind: 'absent-retired', basis: 'same relation: nothing to purge because nothing exists' },
  },
  'integrator.user_questions': {
    reason: 'support question rows of the retired integrator schema',
    userPurge: { kind: 'absent-retired', basis: 'declared for cleanup only: the relation exists in neither managed database (verified on bcb_webapp_dev and bersoncarebot_test)' },
    orgPurge: { kind: 'absent-retired', basis: 'same relation: nothing to purge because nothing exists' },
  },
  'integrator.user_reminder_rules': {
    reason: 'retired integrator reminder-rule projection',
    userPurge: { kind: 'absent-retired', basis: 'declared for cleanup only: the relation exists in neither managed database (verified on bcb_webapp_dev and bersoncarebot_test)' },
    orgPurge: { kind: 'absent-retired', basis: 'same relation: nothing to purge because nothing exists' },
  },
  'public.be_appointment_cancellations': {
    reason: 'a cancellation is a booking fact, not a log line',
    userPurge: { kind: 'anonymised', column: 'actor_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_appointment_events': {
    reason: 'retired duplicate absent from the target schema; declaration entry is cleanup metadata for old databases',
    userPurge: { kind: 'absent-retired', basis: 'declared for cleanup only: the relation exists in neither managed database (verified on bcb_webapp_dev and bersoncarebot_test)' },
    orgPurge: { kind: 'absent-retired', basis: 'same relation: nothing to purge because nothing exists' },
  },
  'public.be_appointment_no_shows': {
    reason: 'a no-show is a booking fact, not a log line',
    userPurge: { kind: 'anonymised', column: 'actor_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_appointment_reschedules': {
    reason: 'a reschedule is a booking fact, not a log line',
    userPurge: { kind: 'anonymised', column: 'actor_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_appointment_staff_comments': {
    reason: 'staff notes on an appointment — clinical content',
    userPurge: { kind: 'cascade', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_appointments': {
    reason: 'an appointment is the booking fact itself, mutated in place through its own status; it is not an append-only journal of something else',
    userPurge: { kind: 'explicit-delete', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_availability_rules': {
    reason: 'availability configuration a slot search reads; edited in place',
    userPurge: {
      kind: 'purge-blocked',
      column: 'specialist_id',
      basis:
        'the only person this row can reach is the SPECIALIST, whose `be_specialists.id` is a `platform_users.id`; runWebappPurgeCoreInTransaction refuses such an account outright (IDENTITY_ROOT_TABLES), so no account purge ever reaches this schedule',
    },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_booking_form_fields': {
    reason: 'booking-form field configuration',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_booking_form_submissions': {
    reason: 'a submitted booking form is patient-entered content',
    userPurge: { kind: 'via-parent', parent: 'public.be_appointments' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_branches': {
    reason: 'clinic branch configuration',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_cancellation_policies': {
    reason: 'cancellation policy configuration',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_clinic_services': {
    reason: 'service catalogue of a clinic',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_organization_members': {
    reason: 'live membership of a person in a clinic, revoked in place; authorisation reads it, nothing sweeps it',
    userPurge: { kind: 'cascade', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_organizations': {
    reason: 'the tenant row itself — one row per clinic, edited in place',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.be_package_items': {
    reason: 'composition of a package template',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'via-parent', parent: 'public.be_subscription_packages' },
  },
  'public.be_package_usages': {
    reason: 'session write-off against a bought subscription — the balance movement itself',
    userPurge: { kind: 'anonymised', column: 'created_by_platform_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_patient_booking_profiles': {
    reason: 'per-clinic booking profile of one patient (self-booking allowed / blocked), edited in place',
    userPurge: { kind: 'cascade', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_patient_package_items': {
    reason: 'per-service composition of a bought subscription',
    userPurge: { kind: 'via-parent', parent: 'public.be_patient_packages' },
    orgPurge: { kind: 'via-parent', parent: 'public.be_patient_packages' },
  },
  'public.be_patient_packages': {
    reason: 'a subscription bought by a patient — live balance, decremented in place',
    userPurge: { kind: 'cascade', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_payment_intents': {
    reason: 'a payment intent is the money object, resolved in place',
    userPurge: { kind: 'anonymised', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_payments': {
    reason: 'a captured payment is a financial record retained for accounting, not a journal line',
    userPurge: { kind: 'explicit-anonymise', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_prepayment_policies': {
    reason: 'prepayment policy configuration',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_refunds': {
    reason: 'a refund is a financial record retained for accounting',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_reschedule_policies': {
    reason: 'reschedule policy configuration',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_rooms': {
    reason: 'branch room configuration',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_schedule_blocks': {
    reason: 'schedule configuration',
    userPurge: { kind: 'staff-authored', column: 'created_by_actor_id', basis: 'schedule blocks are created from the clinic cabinet; the column carries no FK and never holds a client; runStrictPurgePlatformUser refuses any role other than client, so this staff reference is never the purged person' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_schedule_templates': {
    reason: 'schedule configuration',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_service_location_availability': {
    reason: 'which branch offers which service — configuration',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_specialist_locations': {
    reason: 'specialist ↔ branch configuration',
    userPurge: {
      kind: 'purge-blocked',
      column: 'specialist_id',
      basis:
        'the only person this row can reach is the SPECIALIST, whose `be_specialists.id` is a `platform_users.id`; runWebappPurgeCoreInTransaction refuses such an account outright (IDENTITY_ROOT_TABLES), so no account purge ever reaches this schedule',
    },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_specialist_rooms': {
    reason: 'specialist ↔ room configuration',
    userPurge: {
      kind: 'purge-blocked',
      column: 'specialist_id',
      basis:
        'the only person this row can reach is the SPECIALIST, whose `be_specialists.id` is a `platform_users.id`; runWebappPurgeCoreInTransaction refuses such an account outright (IDENTITY_ROOT_TABLES), so no account purge ever reaches this schedule',
    },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_specialist_service_availability': {
    reason: 'which specialist offers which service — configuration',
    userPurge: {
      kind: 'purge-blocked',
      column: 'specialist_id',
      basis:
        'the only person this row can reach is the SPECIALIST, whose `be_specialists.id` is a `platform_users.id`; runWebappPurgeCoreInTransaction refuses such an account outright (IDENTITY_ROOT_TABLES), so no account purge ever reaches this schedule',
    },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_specialists': {
    reason: 'specialist card of a clinic — live directory row, not an event',
    // Exhaustive census audit 2026-08-28, F2: `not-user-scoped` is false. `be_specialists.id` IS a
    // `platform_users.id` (no FK), so one person can hold both a client account and an active
    // specialist root: measured on bcb_webapp_dev, 1 active specialist whose id is a `role='client'`
    // platform user, with 8 working-hours, 1 service-availability and 12 appointment rows hanging
    // off it. Strict purge accepted that row, deleted the platform identity and left the same raw
    // uuid running a live schedule. Purging the doctor's card instead would destroy clinic data
    // that is not the client's, so the purge now refuses the account, whole, before it touches
    // anything.
    userPurge: {
      kind: 'purge-blocked',
      column: 'id',
      basis:
        'runWebappPurgeCoreInTransaction() fails closed with PurgeIdentityRootConflictError before '
        + 'any destructive statement when public.be_specialists holds a row with the same id; '
        + 'runStrictPurgePlatformUser maps it to the typed failure `identity_in_use`.',
    },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_subscription_packages': {
    reason: 'subscription package catalogue of a clinic',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_working_days': {
    reason: 'schedule configuration',
    userPurge: {
      kind: 'purge-blocked',
      column: 'specialist_id',
      basis:
        'the only person this row can reach is the SPECIALIST, whose `be_specialists.id` is a `platform_users.id`; runWebappPurgeCoreInTransaction refuses such an account outright (IDENTITY_ROOT_TABLES), so no account purge ever reaches this schedule',
    },
    orgPurge: { kind: 'organization_id' },
  },
  'public.be_working_hours': {
    reason: 'schedule configuration',
    userPurge: {
      kind: 'purge-blocked',
      column: 'specialist_id',
      basis:
        'the only person this row can reach is the SPECIALIST, whose `be_specialists.id` is a `platform_users.id`; runWebappPurgeCoreInTransaction refuses such an account outright (IDENTITY_ROOT_TABLES), so no account purge ever reaches this schedule',
    },
    orgPurge: { kind: 'organization_id' },
  },
  'public.booking_calendar_map': {
    reason: 'mapping of a booking to its external Google Calendar event id; live pointer, deleted with the event',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.booking_cities': {
    reason: 'reference data',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.broadcast_drafts': {
    reason: 'a doctor\'s unsent broadcast draft, overwritten in place',
    userPurge: { kind: 'staff-authored', column: 'doctor_user_id', basis: 'a draft belongs to the doctor who is writing it; runStrictPurgePlatformUser refuses any role other than client, so this staff reference is never the purged person' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.channel_link_secrets': {
    reason: 'messenger binding secret; single-use credential, not a journal',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.clinic_dedicated_bot_bindings': {
    reason: 'binding of a clinic\'s own bot; live routing state, not history',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.clinic_public_directory_entries': {
    reason: 'public directory card of a clinic; live, replaced in place',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.clinical_anamnesis_illness': {
    reason: 'anamnesis block: past illnesses',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.clinical_anamnesis_lifestyle': {
    reason: 'anamnesis block: lifestyle',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.clinical_anamnesis_trauma': {
    reason: 'anamnesis block: traumas and operations',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.clinical_complaint': {
    reason: 'complaints in the patient card',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.clinical_complaint_update': {
    reason: 'per-visit dynamics of one complaint — part of the complaint, not a log',
    userPurge: { kind: 'via-parent', parent: 'public.clinical_complaint' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.clinical_diagnosis': {
    reason: 'diagnoses in the patient card',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.clinical_diagnosis_catalog': {
    reason: 'diagnosis reference book of a clinic',
    userPurge: { kind: 'staff-authored', column: 'created_by', basis: 'runStrictPurgePlatformUser refuses any role other than client, so this staff reference is never the purged person' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.clinical_diagnosis_update': {
    reason: 'per-visit refinement of one diagnosis',
    userPurge: { kind: 'via-parent', parent: 'public.clinical_diagnosis' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.clinical_test_measure_kinds': {
    reason: 'reference data',
    userPurge: { kind: 'absent-retired', basis: 'declared for cleanup only: the relation exists in neither managed database (verified on bcb_webapp_dev and bersoncarebot_test)' },
    orgPurge: { kind: 'absent-retired', basis: 'same relation: nothing to purge because nothing exists' },
  },
  'public.clinical_test_regions': {
    reason: 'reference data',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.clinical_visit': {
    reason: 'the visit record of the patient card',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.comments': {
    reason: 'user-authored content',
    userPurge: { kind: 'staff-authored', column: 'author_id', basis: 'the only writer is the doctor comments route; author_id carries ON DELETE RESTRICT, so a client author would refuse the purge — measured 0 client authors; runStrictPurgePlatformUser refuses any role other than client, so this staff reference is never the purged person' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.content_access_grants_webapp': {
    reason: 'content access granted to a patient — live entitlement, revoked in place',
    userPurge: { kind: 'explicit-delete', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.content_pages': {
    reason: 'published content',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.content_sections': {
    reason: 'published content',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.courses': {
    reason: 'published content',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.doctor_notes': {
    reason: 'doctor\'s private notes about a patient — clinical content',
    userPurge: { kind: 'explicit-delete', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.doctor_patient_support': {
    reason: 'clinical/demographic profile of a patient under the clinic wall',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.email_send_cooldowns': {
    reason: 'per-user cooldown state, one row per user/kind',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.lfk_complex_exercises': {
    reason: 'program composition',
    userPurge: { kind: 'via-parent', parent: 'public.lfk_complexes' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.lfk_complex_template_exercises': {
    reason: 'program composition',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.lfk_complex_templates': {
    reason: 'exercise-complex templates — clinic library',
    userPurge: { kind: 'staff-authored', column: 'created_by', basis: 'runStrictPurgePlatformUser refuses any role other than client, so this staff reference is never the purged person' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.lfk_complexes': {
    reason: 'exercise complexes assigned to a patient — patient content',
    userPurge: { kind: 'explicit-delete', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.lfk_exercise_media': {
    reason: 'media attached to an exercise — part of the catalogue row',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.lfk_exercise_regions': {
    reason: 'reference data',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.lfk_exercises': {
    reason: 'exercise catalogue',
    userPurge: { kind: 'staff-authored', column: 'created_by', basis: 'runStrictPurgePlatformUser refuses any role other than client, so this staff reference is never the purged person' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.material_ratings': {
    reason: 'user-authored rating, one row per user/material',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.media_folders': {
    reason: 'media-library folders, including a patient private folder — live tree, not a log',
    userPurge: { kind: 'anonymised', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.media_playback_user_video_first_resolve': {
    reason: 'one durable "first watched" mark per patient/video — a product fact, not an event stream',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.motivational_quotes': {
    reason: 'reference content',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.online_intake_answers': {
    reason: 'answers of one intake request — patient-entered content',
    userPurge: { kind: 'via-parent', parent: 'public.online_intake_requests' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.online_intake_attachments': {
    reason: 'files attached to one intake request',
    userPurge: { kind: 'via-parent', parent: 'public.online_intake_requests' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.online_intake_requests': {
    reason: 'the intake request itself — patient-entered content',
    userPurge: { kind: 'explicit-delete', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.org_brand_revisions': {
    reason: 'published brand versions; a revision is content, not a log line',
    userPurge: { kind: 'staff-authored', column: 'archived_by_platform_user_id, created_by_platform_user_id, published_by_platform_user_id', basis: 'brand revisions are published by clinic staff; runStrictPurgePlatformUser refuses any role other than client, so this staff reference is never the purged person' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.org_enrollments': {
    reason: 'live attachment of a person to a clinic — the tenant wall itself depends on it',
    userPurge: { kind: 'cascade', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.organization_member_invites': {
    reason: 'a staff invite is a pending live object, resolved or expired in place',
    userPurge: { kind: 'staff-authored', column: 'accepted_by_platform_user_id, created_by_platform_user_id', basis: 'runStrictPurgePlatformUser refuses any role other than client, so this staff reference is never the purged person' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.organization_slug_claims': {
    reason: 'live claim on a public slug, not history',
    userPurge: { kind: 'staff-authored', column: 'created_by_platform_user_id', basis: 'a slug is claimed by clinic staff; runStrictPurgePlatformUser refuses any role other than client, so this staff reference is never the purged person' },
    // Exhaustive census audit 2026-08-28, F3: `organization_id` was false — the live FK was the
    // default NO ACTION, so 5 live claim rows on bcb_webapp_dev REFUSED the organization delete.
    // Deleting the claim would release the public slug for anyone to take over, which is exactly
    // what the reserved-slug list exists to prevent, so the clinic reference is nulled and the
    // claim survives as an unlinked tombstone that still holds the name.
    orgPurge: {
      kind: 'org-anonymised',
      column: 'organization_id',
      basis:
        'organization_slug_claims_organization_id_fkey ON DELETE SET NULL '
        + '(20260828T131900_organization_purge_reaches_every_named_class.sql)',
    },
  },
  'public.password_login_identifier_protection': {
    reason: 'per-identifier lockout state, one row per identifier',
    userPurge: { kind: 'self-expiring', column: 'leased_user_id', basis: 'verification lease, released with verification_lease_until; the row is per identifier, not per person' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.patient_bookings': {
    reason: 'legacy booking rows kept until the be_appointments cutover finishes; the row is the booking, not a log of it',
    userPurge: { kind: 'explicit-delete', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.patient_comorbidity': {
    reason: 'comorbidity block of the patient card',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.patient_content_rating_feedback': {
    reason: 'one rating row per patient/material',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.patient_daily_warmup_presentations': {
    reason: 'one row per patient/day presentation decision',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.patient_daily_warmup_video_views': {
    reason: 'one row per patient/video view decision',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.patient_files': {
    reason: 'medical documents in the patient card',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.patient_home_block_items': {
    reason: 'items of a patient-home block — configuration',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.patient_home_blocks': {
    reason: 'patient-home layout configuration of a clinic',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.patient_invites': {
    reason: 'a portal invite is a live pending object, accepted or revoked in place',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.patient_lfk_assignments': {
    reason: 'exercise complexes assigned to a patient — patient content',
    userPurge: { kind: 'explicit-delete', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.patient_merge_candidates': {
    reason: 'live merge worklist, resolved in place',
    userPurge: { kind: 'cascade', column: 'anchor_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.patient_payment': {
    reason: 'payment history line of one patient — a financial record of the clinic',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.patient_specialist_links': {
    reason: 'live "own patient" link between a patient and a specialist',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.phone_messenger_bind_secrets': {
    reason: 'messenger binding secret; single-use credential',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.platform_user_contacts': {
    reason: 'additional contacts of a person — live contact list',
    userPurge: { kind: 'cascade', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.platform_users': {
    reason: 'the one personal-data table: the person themselves, not a record about them',
    userPurge: { kind: 'anonymised', column: 'merged_into_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.program_item_discussion_messages': {
    reason: 'doctor ↔ patient discussion of a program item — the conversation content itself',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.program_item_discussion_reads': {
    reason: 'per-patient read marks of a discussion; one row per reader, updated in place',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.recommendation_regions': {
    reason: 'reference data',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.recommendations': {
    reason: 'recommendation reference book of a clinic',
    userPurge: { kind: 'anonymised', column: 'created_by' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.reference_catalog_baselines': {
    reason: 'versioned reference templates',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.reference_catalog_snapshot_receipts': {
    reason: 'per-organization seeding receipt, one row per org',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.reference_categories': {
    reason: 'reference catalogue categories of a clinic',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.reference_items': {
    reason: 'reference catalogue items of a clinic',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.reminder_rules': {
    reason: 'the reminder rule of a patient — live configuration; its occurrences live in reminder_occurrence_history',
    userPurge: { kind: 'explicit-delete', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.saas_billing_accounts': {
    reason: 'billing profile of a clinic — one live row per organization',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.saas_billing_invoices': {
    reason: 'issued invoices — financial records retained for accounting',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.saas_billing_periods': {
    reason: 'reference data',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.saas_billing_refunds': {
    reason: 'refunds — financial records retained for accounting',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.saas_billing_subscriptions': {
    reason: 'live subscription of a clinic',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.saas_org_entitlement_overrides': {
    reason: 'manual entitlement grants to a clinic — live switches',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.saas_organization_trials': {
    reason: 'one trial row per organization',
    userPurge: { kind: 'staff-authored', column: 'created_by', basis: 'a trial is opened by platform staff; runStrictPurgePlatformUser refuses any role other than client, so this staff reference is never the purged person' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.saas_paid_period_policy': {
    reason: 'single-row platform policy: what happens after the paid period',
    userPurge: { kind: 'staff-authored', column: 'updated_by', basis: 'single-row platform policy edited by platform staff; runStrictPurgePlatformUser refuses any role other than client, so this staff reference is never the purged person' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.saas_registration_tariff_policy': {
    reason: 'single-row platform policy: default tariff at registration',
    userPurge: { kind: 'staff-authored', column: 'updated_by', basis: 'single-row platform policy edited by platform staff; runStrictPurgePlatformUser refuses any role other than client, so this staff reference is never the purged person' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.saas_tariffs': {
    reason: 'platform tariff reference data',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.saas_trial_policy': {
    reason: 'single-row platform policy: trial duration and aftermath',
    userPurge: { kind: 'staff-authored', column: 'updated_by', basis: 'single-row platform policy edited by platform staff; runStrictPurgePlatformUser refuses any role other than client, so this staff reference is never the purged person' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.schema_migrations': {
    reason: 'applied-migration ledger',
    userPurge: { kind: 'absent-retired', basis: 'declared for cleanup only: the relation exists in neither managed database (verified on bcb_webapp_dev and bersoncarebot_test)' },
    orgPurge: { kind: 'absent-retired', basis: 'same relation: nothing to purge because nothing exists' },
  },
  'public.specialist_signup_intents': {
    reason: 'a pending signup, resolved or abandoned; not a journal',
    userPurge: { kind: 'cascade', column: 'user_id' },
    // The exhaustive census claimed `organization_id`; this table has no such column. Its clinic
    // reference is the organization the signup PROVISIONED, and the live FK already nulls it, which
    // is right: the intent is the applicant's record of what happened, not the clinic's row.
    orgPurge: {
      kind: 'org-anonymised',
      column: 'provisioned_organization_id',
      basis: 'specialist_signup_intents_org_fkey ON DELETE SET NULL',
    },
  },
  'public.specialist_tasks': {
    reason: 'live task list of a specialist, not a journal — but the row references a patient and must not keep pointing at a purged one',
    userPurge: { kind: 'explicit-anonymise', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.staff_security_profiles': {
    reason: 'one security profile row per staff user',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.support_conversation_messages': {
    reason: 'messages of a support conversation — the content itself',
    userPurge: { kind: 'via-parent', parent: 'public.support_conversations' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.support_conversations': {
    reason: 'support conversation of a patient — the conversation object',
    userPurge: { kind: 'explicit-delete', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.support_question_messages': {
    reason: 'replies inside one question — the content itself',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.support_questions': {
    reason: 'a question from the messenger — live worklist item, answered in place',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.symptom_entries': {
    reason: 'diary measurements of a patient — patient content',
    userPurge: { kind: 'cascade', column: 'platform_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.symptom_trackings': {
    reason: 'what a patient tracks — patient diary configuration',
    userPurge: { kind: 'explicit-delete', column: 'user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.system_settings': {
    reason: 'live runtime configuration',
    userPurge: { kind: 'staff-authored', column: 'updated_by', basis: 'runtime configuration edited by platform staff; purge additionally nulls the column; runStrictPurgePlatformUser refuses any role other than client, so this staff reference is never the purged person' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.test_results': {
    reason: 'clinical result rows of one test attempt',
    userPurge: { kind: 'anonymised', column: 'decided_by' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.test_set_items': {
    reason: 'reference composition',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.test_sets': {
    reason: 'reference data',
    userPurge: { kind: 'anonymised', column: 'created_by' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.tests': {
    reason: 'reference data',
    userPurge: { kind: 'anonymised', column: 'created_by' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.treatment_program_instance_stage_groups': {
    reason: 'program composition',
    userPurge: { kind: 'via-parent', parent: 'public.treatment_program_instance_stages' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.treatment_program_instance_stage_items': {
    reason: 'program composition',
    userPurge: { kind: 'via-parent', parent: 'public.treatment_program_instance_stages' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.treatment_program_instance_stages': {
    reason: 'program composition',
    userPurge: { kind: 'via-parent', parent: 'public.treatment_program_instances' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.treatment_program_instances': {
    reason: 'assigned program, part of the patient record',
    userPurge: { kind: 'cascade', column: 'patient_user_id' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.treatment_program_template_stage_groups': {
    reason: 'template composition',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.treatment_program_template_stage_items': {
    reason: 'template composition',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.treatment_program_template_stages': {
    reason: 'template composition',
    userPurge: { kind: 'not-user-scoped' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.treatment_program_templates': {
    reason: 'reference template',
    userPurge: { kind: 'anonymised', column: 'created_by' },
    orgPurge: { kind: 'organization_id' },
  },
  'public.user_channel_bindings': {
    reason: 'messenger binding state',
    userPurge: { kind: 'explicit-delete', column: 'user_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.user_channel_preferences': {
    reason: 'per-channel consent of a person — live preference',
    userPurge: { kind: 'cascade', column: 'platform_user_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.user_contacts': {
    reason: 'canonical contact index of a person — live login/search key',
    userPurge: { kind: 'explicit-delete', column: 'platform_user_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.user_identity': {
    reason: 'name and birth date of the person',
    userPurge: { kind: 'cascade', column: 'platform_user_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.user_notification_topic_channels': {
    reason: 'per-user channel preference',
    userPurge: { kind: 'explicit-delete', column: 'user_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.user_notification_topics': {
    reason: 'per-user subscription state',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.user_oauth_bindings': {
    reason: 'credential state',
    userPurge: { kind: 'explicit-delete', column: 'user_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.user_passkey_accounts': {
    reason: 'credential state',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.user_passkey_credentials': {
    reason: 'credential state',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.user_password_credentials': {
    reason: 'credential state',
    userPurge: { kind: 'cascade', column: 'user_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.user_pins': {
    reason: 'credential state',
    userPurge: { kind: 'absent-retired', basis: 'declared for cleanup only: the relation exists in neither managed database (verified on bcb_webapp_dev and bersoncarebot_test)' },
    orgPurge: { kind: 'absent-retired', basis: 'same relation: nothing to purge because nothing exists' },
  },
  'public.user_web_push_subscriptions': {
    reason: 'browser push subscription — live endpoint, removed when it dies',
    userPurge: { kind: 'explicit-delete', column: 'user_id' },
    orgPurge: { kind: 'not-org-scoped' },
  },
  'public.webapp_schema_migrations': {
    reason: 'applied-migration ledger',
    userPurge: { kind: 'absent-retired', basis: 'declared for cleanup only: the relation exists in neither managed database (verified on bcb_webapp_dev and bersoncarebot_test)' },
    orgPurge: { kind: 'absent-retired', basis: 'same relation: nothing to purge because nothing exists' },
  },
};
