/**
 * Bounded at-rest record of support-form submissions (patient + guest, night plan D-2) that
 * the operator-alert relay could not confirm delivered on ANY configured channel.
 *
 * Why this exists: `dispatchOperatorAlert` (operator-alerts module) is the reused delivery
 * mechanism, but its guaranteed empty-audience fallback (`reportEmptyAudience`, design D-b/D-h)
 * is DELIBERATELY content-free — it alerts "something failed", never the original text. That
 * is correct for system/operational alerts, but it means a total delivery failure here would
 * still lose the patient's/guest's actual message unless something else keeps it.
 *
 * This is that something else. It is NOT an outbound notification (no D-h concern — nothing
 * leaves our own database) and NOT a support-ticket system (docs/_TODO/SAAS_FOUNDATION/
 * ADMIN_BASELINE_AND_SUPPORT_CHAT_DESIGN.md is the real thing, not built, out of scope here).
 * It reuses `operator_job_status` — a table the webapp runtime role already has grants for
 * (see `reportEmptyNotificationAudience.ts`), keyed by a new, dedicated job key, so no new
 * migration/grant/RLS surface is introduced. Bounded ring buffer, same trim pattern as
 * `emptyAudience.ts`'s `byTopic`.
 */

export const SUPPORT_UNDELIVERED_JOB_FAMILY = 'support' as const;
export const SUPPORT_UNDELIVERED_JOB_KEY = 'support.undelivered_submissions' as const;

export type UndeliveredSupportSubmission = {
  /** ISO timestamp of the submission (not the persistence attempt). */
  at: string;
  kind: 'patient' | 'guest';
  email: string;
  message: string;
  userId?: string;
  fromPath?: string | null;
};

/** How many undelivered submissions we keep verbatim; older ones only survive in `total`. */
const MAX_KEPT = 20;
/** Bound a single row's JSONB growth; route-level validation already caps at 4000. */
const MAX_MESSAGE_CHARS = 2000;

export type UndeliveredSupportSubmissionsMeta = {
  items: UndeliveredSupportSubmission[];
  total: number;
};

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function parseOne(entry: unknown): UndeliveredSupportSubmission | null {
  if (!entry || typeof entry !== 'object') return null;
  const e = entry as Record<string, unknown>;
  if (typeof e.at !== 'string' || typeof e.email !== 'string' || typeof e.message !== 'string')
    return null;
  const kind = e.kind === 'guest' ? 'guest' : 'patient';
  return {
    at: e.at,
    kind,
    email: e.email,
    message: e.message,
    ...(typeof e.userId === 'string' && e.userId ? { userId: e.userId } : {}),
    ...(typeof e.fromPath === 'string' && e.fromPath ? { fromPath: e.fromPath } : {}),
  };
}

export function parseUndeliveredSupportSubmissionsMeta(
  meta: unknown,
): UndeliveredSupportSubmissionsMeta {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return { items: [], total: 0 };
  const m = meta as Record<string, unknown>;
  const rawItems = Array.isArray(m.items) ? m.items : [];
  const items = rawItems.map(parseOne).filter((x): x is UndeliveredSupportSubmission => x !== null);
  return { items, total: asNumber(m.total) };
}

/** Prepend the new submission, clip its message, trim the kept list, bump the monotonic total. */
export function mergeUndeliveredSupportSubmissions(
  previousMeta: unknown,
  next: UndeliveredSupportSubmission,
): UndeliveredSupportSubmissionsMeta {
  const previous = parseUndeliveredSupportSubmissionsMeta(previousMeta);
  const item: UndeliveredSupportSubmission = {
    at: next.at,
    kind: next.kind,
    email: next.email,
    message: clip(next.message, MAX_MESSAGE_CHARS),
    ...(next.userId ? { userId: next.userId } : {}),
    ...(next.fromPath ? { fromPath: next.fromPath } : {}),
  };
  return {
    items: [item, ...previous.items].slice(0, MAX_KEPT),
    total: previous.total + 1,
  };
}
