/**
 * Quiet re-sync: Rubitime API → integrator rubitime_records.
 *
 * Safety guarantees:
 *  - Dry-run by default (add --commit to apply).
 *  - NEVER calls enqueueProjectionEvent or triggers any webhook/fan-out.
 *  - Commit path only updates rows that actually differ (no-op for matching rows).
 *
 * Modes (--mode=...):
 *  resync (default):
 *    Fetch each local record from Rubitime API, compute diff, optionally apply.
 *    Diff classes: record_at | status | phone | payload | stale | not_found.
 *
 *  repair-outbox:
 *    Find dead/pending appointment.record.upserted events whose last_error contains
 *    "platform_user_id", optionally requeue them (reset to pending, attempts_done=0).
 *
 * Usage:
 *   pnpm --dir apps/integrator run rubitime:resync
 *   pnpm --dir apps/integrator run rubitime:resync -- --commit
 *   pnpm --dir apps/integrator run rubitime:resync -- --active-days=30 --canceled-days=30
 *   pnpm --dir apps/integrator run rubitime:resync -- --mode=repair-outbox
 *   pnpm --dir apps/integrator run rubitime:resync -- --mode=repair-outbox --commit
 *   pnpm --dir apps/integrator run rubitime:resync -- --mode=repair-outbox --commit --phone-last10=9001234567
 *   pnpm --dir apps/integrator run rubitime:resync -- --mode=repair-outbox --dry-run --record-ids=123,456
 */
import '../../config/loadEnv.js';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getRubitimeRecordAtUtcOffsetMinutesForInstant } from '../../config/appTimezone.js';
import { createDbPort, closeDb } from '../db/client.js';
import { fetchRubitimeRecordById } from '../../integrations/rubitime/client.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type LocalStatus = 'created' | 'updated' | 'canceled';
export type DiffClass = 'record_at' | 'status' | 'phone' | 'payload' | 'stale' | 'not_found';

export type ResyncDiff = {
  classes: DiffClass[];
  reasons: string[];
};

type LocalRow = {
  id: number;
  rubitime_record_id: string;
  phone_normalized: string | null;
  record_at: Date | null;
  status: LocalStatus;
  payload_json: unknown;
  updated_at: Date | null;
  created_at: Date | null;
};

type RecordUpdate = {
  record_at?: string | null;
  status?: LocalStatus;
  phone_normalized?: string | null;
  replacePayload?: Record<string, unknown>;
};

type OutboxRow = {
  id: number;
  idempotency_key: string;
  event_type: string;
  status: string;
  attempts_done: number;
  last_error: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
};

type ResyncArgs = {
  mode: 'resync' | 'repair-outbox';
  commit: boolean;
  activeDays: number;
  canceledDays: number;
  limit: number;
  batchSize: number;
  concurrency: number;
  minIntervalMs: number;
  retryCount: number;
  retryBaseMs: number;
  rubitimeOffsetMinutes: number;
  staleThresholdMinutes: number;
  sampleSize: number;
  reportFile: string | null;
  phoneLastN: string | null;
  recordIds: string[];
};

// ── Pure helpers (exported for unit tests) ───────────────────────────────────

export function normalizePhoneForCompare(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('9')) return `7${digits}`;
  return digits;
}

export function isRubitimeCanceled(remote: Record<string, unknown>): boolean {
  const status = nonEmptyStr(remote.status)?.toLowerCase() ?? '';
  const statusTitle = nonEmptyStr(remote.status_title)?.toLowerCase() ?? '';
  return (
    status === '4' ||
    status === 'canceled' ||
    status === 'cancelled' ||
    statusTitle.includes('отмен')
  );
}

export function rubitimeMaybeDateToIso(value: unknown, offsetMinutes: number): string | null {
  const s = nonEmptyStr(value);
  if (!s) return null;
  const hasExplicitZone = /Z$/i.test(s) || /[+-]\d{2}:\d{2}$/.test(s);
  if (hasExplicitZone) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const naiveLocal = /^\d{4}-\d{2}-\d{2}(?: |T)\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(s);
  if (naiveLocal) {
    const isoLocal = s.includes('T') ? s : s.replace(' ', 'T');
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMinutes);
    const oh = String(Math.floor(abs / 60)).padStart(2, '0');
    const om = String(abs % 60).padStart(2, '0');
    const d = new Date(`${isoLocal}${sign}${oh}:${om}`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function mapRemoteStatusToLocal(
  remote: Record<string, unknown>,
  localStatus: LocalStatus,
): LocalStatus {
  if (isRubitimeCanceled(remote)) return 'canceled';
  if (localStatus === 'canceled') return 'updated';
  return localStatus;
}

export function computeResyncDiff(
  local: LocalRow,
  remote: Record<string, unknown>,
  offsetMinutes: number,
  staleThresholdMinutes: number,
): ResyncDiff {
  const classes: DiffClass[] = [];
  const reasons: string[] = [];
  const push = (cls: DiffClass, reason: string): void => {
    if (!classes.includes(cls)) classes.push(cls);
    reasons.push(reason);
  };

  const localPhone = normalizePhoneForCompare(local.phone_normalized);
  const remotePhone = normalizePhoneForCompare(nonEmptyStr(remote.phone));
  if (localPhone && remotePhone && localPhone !== remotePhone) {
    push('phone', `phone mismatch local=${local.phone_normalized} remote=${nonEmptyStr(remote.phone)}`);
  }

  const localCanceled = local.status === 'canceled';
  const remoteCanceled = isRubitimeCanceled(remote);
  if (localCanceled !== remoteCanceled) {
    push(
      'status',
      `status mismatch local=${local.status} remoteStatus=${nonEmptyStr(remote.status) ?? 'null'}`,
    );
  }

  const localRecordAtIso = dateToIso(local.record_at);
  const remoteRecordAtIso = rubitimeMaybeDateToIso(remote['record'] ?? remote['datetime'], offsetMinutes);
  if (localRecordAtIso && remoteRecordAtIso) {
    const diffMin = Math.round((Date.parse(remoteRecordAtIso) - Date.parse(localRecordAtIso)) / 60_000);
    if (diffMin !== 0) {
      push('record_at', `record_at mismatch diffMin=${diffMin} local=${localRecordAtIso} remote=${remoteRecordAtIso}`);
    }
  }

  const PAYLOAD_FIELDS_TO_CHECK: ReadonlyArray<string> = [
    'branch_id', 'service_id', 'name', 'email', 'phone', 'status', 'record', 'datetime',
  ];
  const localPayload = asRecord(local.payload_json);
  const driftFields: string[] = [];
  for (const key of PAYLOAD_FIELDS_TO_CHECK) {
    const lv = localPayload[key] == null ? null : String(localPayload[key]).trim();
    const rv = remote[key] == null ? null : String(remote[key]).trim();
    if (lv !== null && rv !== null && lv !== rv) driftFields.push(key);
  }
  if (driftFields.length > 0) {
    push('payload', `payload drift fields=[${driftFields.join(',')}]`);
  }

  const localUpdatedAtIso = dateToIso(local.updated_at);
  const remoteUpdatedAtIso = rubitimeMaybeDateToIso(remote['updated_at'], offsetMinutes);
  if (localUpdatedAtIso && remoteUpdatedAtIso) {
    const lts = Date.parse(localUpdatedAtIso);
    const rts = Date.parse(remoteUpdatedAtIso);
    const diffMin = Math.round((rts - lts) / 60_000);
    if (Number.isFinite(lts) && Number.isFinite(rts) && diffMin > staleThresholdMinutes) {
      push('stale', `stale diffMin=${diffMin} local=${localUpdatedAtIso} remote=${remoteUpdatedAtIso}`);
    }
  }

  return { classes, reasons };
}

export function buildResyncUpdate(
  local: LocalRow,
  remote: Record<string, unknown>,
  diff: ResyncDiff,
  offsetMinutes: number,
): RecordUpdate {
  const update: RecordUpdate = {};

  if (diff.classes.includes('record_at')) {
    update.record_at = rubitimeMaybeDateToIso(remote['record'] ?? remote['datetime'], offsetMinutes);
  }
  if (diff.classes.includes('status')) {
    update.status = mapRemoteStatusToLocal(remote, local.status);
  }
  if (diff.classes.includes('phone')) {
    update.phone_normalized = normalizePhoneForCompare(nonEmptyStr(remote.phone));
  }
  if (diff.classes.includes('payload') || diff.classes.includes('stale')) {
    update.replacePayload = remote;
  }

  return update;
}

/** Returns true when the outbox row is a repair candidate for the platform_user_id null bug. */
export function isOutboxRepairCandidate(row: {
  event_type: string;
  status: string;
  last_error: string | null;
}): boolean {
  return (
    row.event_type === 'appointment.record.upserted' &&
    (row.status === 'dead' || row.status === 'pending') &&
    row.last_error !== null &&
    row.last_error.toLowerCase().includes('platform_user_id')
  );
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function nonEmptyStr(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function dateToIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && value.trim().length > 0) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function parsePositiveInt(raw: string | undefined, fallback: number, min = 1, max = 10_000_000): number {
  if (!raw || raw.length === 0) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let nextAllowedRequestAt = 0;
async function waitForRateWindow(minIntervalMs: number): Promise<void> {
  if (minIntervalMs <= 0) return;
  const waitMs = nextAllowedRequestAt - Date.now();
  if (waitMs > 0) await sleep(waitMs);
  nextAllowedRequestAt = Date.now() + minIntervalMs;
}

function isRateLimitError(msg: string): boolean {
  return msg.toLowerCase().includes('limit on the number of consecutive requests');
}

function isNotFoundError(msg: string): boolean {
  return msg.toLowerCase().includes('record not found');
}

async function fetchWithRetry(input: {
  recordId: string;
  minIntervalMs: number;
  retryCount: number;
  retryBaseMs: number;
}): Promise<Record<string, unknown>> {
  const maxAttempts = input.retryCount + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await waitForRateWindow(input.minIntervalMs);
    try {
      const result = await fetchRubitimeRecordById({ recordId: input.recordId });
      return asRecord(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isRateLimitError(message) && attempt < maxAttempts - 1) {
        await sleep(input.retryBaseMs * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error('unexpected_retries_exit');
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// ── DB operations ─────────────────────────────────────────────────────────────

type DbPort = ReturnType<typeof createDbPort>;

async function fetchRecordsBatch(input: {
  db: DbPort;
  lastId: number;
  activeDays: number;
  canceledDays: number;
  batchSize: number;
  remainingLimit: number;
}): Promise<LocalRow[]> {
  const effectiveSize =
    input.remainingLimit > 0 ? Math.min(input.batchSize, input.remainingLimit) : input.batchSize;
  if (effectiveSize <= 0) return [];

  const res = await input.db.query<LocalRow>(
    `SELECT
       id, rubitime_record_id, phone_normalized, record_at, status,
       payload_json, updated_at, created_at
     FROM rubitime_records
     WHERE id > $1
       AND (
         (status IN ('created','updated') AND COALESCE(updated_at,record_at,created_at) >= now() - ($2::int * interval '1 day'))
         OR
         (status = 'canceled' AND COALESCE(updated_at,record_at,created_at) >= now() - ($3::int * interval '1 day'))
       )
     ORDER BY id ASC
     LIMIT $4`,
    [input.lastId, input.activeDays, input.canceledDays, effectiveSize],
  );
  return res.rows;
}

async function applyResyncUpdate(db: DbPort, localId: number, update: RecordUpdate): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [localId];
  let idx = 2;

  if ('record_at' in update) {
    sets.push(`record_at = $${idx++}`);
    params.push(update.record_at ?? null);
  }
  if ('status' in update) {
    sets.push(`status = $${idx++}`);
    params.push(update.status);
  }
  if ('phone_normalized' in update) {
    sets.push(`phone_normalized = $${idx++}`);
    params.push(update.phone_normalized ?? null);
  }
  if (update.replacePayload !== undefined) {
    sets.push(`payload_json = $${idx}::jsonb`);
    params.push(JSON.stringify(update.replacePayload));
  }
  if (sets.length === 0) return;
  sets.push('updated_at = now()');

  await db.query(`UPDATE rubitime_records SET ${sets.join(', ')} WHERE id = $1`, params);
}

async function fetchOutboxRepairCandidates(input: {
  db: DbPort;
  phoneLastN: string | null;
  recordIds: string[];
  limit: number;
}): Promise<OutboxRow[]> {
  const conditions: string[] = [
    `event_type = 'appointment.record.upserted'`,
    `status IN ('dead','pending')`,
    `last_error ILIKE '%platform_user_id%'`,
  ];
  const params: unknown[] = [];
  let idx = 1;

  if (input.phoneLastN) {
    conditions.push(`payload::text LIKE $${idx++}`);
    params.push(`%${input.phoneLastN}%`);
  }
  if (input.recordIds.length > 0) {
    conditions.push(
      `(payload->>'integratorRecordId' = ANY($${idx}) OR payload->>'rubitimeRecordId' = ANY($${idx}))`,
    );
    params.push(input.recordIds);
  }

  const limitClause = input.limit > 0 ? ` LIMIT ${input.limit}` : '';
  const sql = `
    SELECT id, idempotency_key, event_type, status, attempts_done, last_error,
           payload, occurred_at::text AS occurred_at
    FROM projection_outbox
    WHERE ${conditions.join(' AND ')}
    ORDER BY id DESC${limitClause}`;

  const res = await input.db.query<OutboxRow>(sql, params.length > 0 ? params : undefined);
  return res.rows;
}

async function applyOutboxRequeue(db: DbPort, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const res = await db.query(
    `UPDATE projection_outbox
     SET status = 'pending', attempts_done = 0, last_error = NULL,
         next_try_at = now(), updated_at = now()
     WHERE id = ANY($1)`,
    [ids],
  );
  return res.rowCount ?? 0;
}

// ── Args parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv: string[], defaultRubitimeOffsetMinutes: number): ResyncArgs {
  const get = (prefix: string): string | undefined => {
    const item = argv.find((x) => x.startsWith(prefix));
    return item ? item.slice(prefix.length) : undefined;
  };
  const getMode = (): ResyncArgs['mode'] => {
    const raw = get('--mode=');
    if (raw === 'repair-outbox') return 'repair-outbox';
    return 'resync';
  };

  return {
    mode: getMode(),
    commit: argv.includes('--commit'),
    activeDays: parsePositiveInt(get('--active-days='), 20, 1, 3650),
    canceledDays: parsePositiveInt(get('--canceled-days='), 20, 1, 3650),
    limit: parsePositiveInt(get('--limit='), 0, 0, 10_000_000),
    batchSize: parsePositiveInt(get('--batch-size='), 200, 1, 5000),
    concurrency: parsePositiveInt(get('--concurrency='), 3, 1, 50),
    minIntervalMs: parsePositiveInt(get('--min-interval-ms='), 5200, 0, 60_000),
    retryCount: parsePositiveInt(get('--retry-count='), 2, 0, 20),
    retryBaseMs: parsePositiveInt(get('--retry-base-ms='), 5500, 100, 120_000),
    rubitimeOffsetMinutes: parsePositiveInt(
      get('--rubitime-offset-minutes='),
      defaultRubitimeOffsetMinutes,
      -720,
      840,
    ),
    staleThresholdMinutes: parsePositiveInt(get('--stale-threshold-minutes='), 120, 1, 10080),
    sampleSize: parsePositiveInt(get('--sample-size='), 25, 1, 1000),
    reportFile: nonEmptyStr(get('--report-file=')),
    phoneLastN: nonEmptyStr(get('--phone-last10=')) ?? nonEmptyStr(get('--phone-last-n=')),
    recordIds: (get('--record-ids=') ?? '').split(',').map((x) => x.trim()).filter(Boolean),
  };
}

// ── Resync orchestration ──────────────────────────────────────────────────────

type ResyncSummary = {
  scanned: number;
  compared: number;
  matches: number;
  mismatches: number;
  updated: number;
  apiErrors: number;
  notFound: number;
  notFoundActive: number;
  notFoundCanceled: number;
  classCounts: Partial<Record<DiffClass, number>>;
  samples: {
    mismatches: Array<{ recordId: string; classes: DiffClass[]; reasons: string[] }>;
    apiErrors: Array<{ recordId: string; error: string }>;
    notFound: Array<{ recordId: string; localStatus: LocalStatus; error: string }>;
  };
};

async function runResync(args: ResyncArgs, db: DbPort): Promise<ResyncSummary> {
  const effectiveConcurrency = args.minIntervalMs > 0 ? 1 : args.concurrency;
  if (args.minIntervalMs > 0 && args.concurrency > 1) {
    console.warn(
      `[warn] min-interval-ms=${args.minIntervalMs} forces concurrency=1 for safe rate-limiting`,
    );
  }

  const summary: ResyncSummary = {
    scanned: 0,
    compared: 0,
    matches: 0,
    mismatches: 0,
    updated: 0,
    apiErrors: 0,
    notFound: 0,
    notFoundActive: 0,
    notFoundCanceled: 0,
    classCounts: {},
    samples: { mismatches: [], apiErrors: [], notFound: [] },
  };

  let lastId = 0;
  let remainingLimit = args.limit;

  while (true) {
    const batch = await fetchRecordsBatch({
      db,
      lastId,
      activeDays: args.activeDays,
      canceledDays: args.canceledDays,
      batchSize: args.batchSize,
      remainingLimit,
    });
    if (batch.length === 0) break;

    summary.scanned += batch.length;
    lastId = batch[batch.length - 1]!.id;
    if (remainingLimit > 0) remainingLimit -= batch.length;

    type BatchEntry =
      | { kind: 'match'; recordId: string }
      | { kind: 'mismatch'; recordId: string; localId: number; classes: DiffClass[]; reasons: string[]; update: RecordUpdate }
      | { kind: 'not_found'; recordId: string; localId: number; localStatus: LocalStatus; error: string }
      | { kind: 'api_error'; recordId: string; error: string };

    const batchResults = await mapWithConcurrency<LocalRow, BatchEntry>(
      batch,
      effectiveConcurrency,
      async (row): Promise<BatchEntry> => {
        const recordId = String(row.rubitime_record_id);
        try {
          const remote = await fetchWithRetry({
            recordId,
            minIntervalMs: args.minIntervalMs,
            retryCount: args.retryCount,
            retryBaseMs: args.retryBaseMs,
          });
          const diff = computeResyncDiff(row, remote, args.rubitimeOffsetMinutes, args.staleThresholdMinutes);
          if (diff.classes.length === 0) return { kind: 'match', recordId };
          return {
            kind: 'mismatch',
            recordId,
            localId: row.id,
            classes: diff.classes,
            reasons: diff.reasons,
            update: buildResyncUpdate(row, remote, diff, args.rubitimeOffsetMinutes),
          };
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          if (isNotFoundError(error)) {
            return { kind: 'not_found', recordId, localId: row.id, localStatus: row.status, error };
          }
          return { kind: 'api_error', recordId, error };
        }
      },
    );

    for (const result of batchResults) {
      summary.compared++;
      if (result.kind === 'match') {
        summary.matches++;
        continue;
      }
      if (result.kind === 'mismatch') {
        summary.mismatches++;
        for (const cls of result.classes) {
          summary.classCounts[cls] = (summary.classCounts[cls] ?? 0) + 1;
        }
        if (summary.samples.mismatches.length < args.sampleSize) {
          summary.samples.mismatches.push({
            recordId: result.recordId,
            classes: result.classes,
            reasons: result.reasons,
          });
        }
        if (args.commit) {
          await applyResyncUpdate(db, result.localId, result.update);
          summary.updated++;
        }
        continue;
      }
      if (result.kind === 'not_found') {
        summary.notFound++;
        if (result.localStatus === 'canceled') summary.notFoundCanceled++;
        else summary.notFoundActive++;
        if (summary.samples.notFound.length < args.sampleSize) {
          summary.samples.notFound.push({
            recordId: result.recordId,
            localStatus: result.localStatus,
            error: result.error,
          });
        }
        continue;
      }
      summary.apiErrors++;
      if (summary.samples.apiErrors.length < args.sampleSize) {
        summary.samples.apiErrors.push({ recordId: result.recordId, error: result.error });
      }
    }

    console.log(
      `[progress] scanned=${summary.scanned} compared=${summary.compared}` +
      ` matches=${summary.matches} mismatches=${summary.mismatches}` +
      ` updated=${summary.updated} notFound=${summary.notFound}` +
      ` (active=${summary.notFoundActive}, canceled=${summary.notFoundCanceled})` +
      ` apiErrors=${summary.apiErrors}`,
    );

    if (args.limit > 0 && remainingLimit <= 0) break;
  }

  return summary;
}

// ── Repair-outbox orchestration ───────────────────────────────────────────────

type RepairOutboxSummary = {
  found: number;
  requeued: number;
  samples: Array<{
    id: number;
    idempotencyKey: string;
    status: string;
    lastError: string | null;
    rubitimeRecordId: string | null;
    phone: string | null;
  }>;
};

async function runRepairOutbox(args: ResyncArgs, db: DbPort): Promise<RepairOutboxSummary> {
  const rows = await fetchOutboxRepairCandidates({
    db,
    phoneLastN: args.phoneLastN,
    recordIds: args.recordIds,
    limit: args.limit,
  });

  const candidates = rows.filter(isOutboxRepairCandidate);

  const summary: RepairOutboxSummary = {
    found: candidates.length,
    requeued: 0,
    samples: candidates.slice(0, args.sampleSize).map((r) => ({
      id: r.id,
      idempotencyKey: r.idempotency_key,
      status: r.status,
      lastError: r.last_error,
      rubitimeRecordId:
        nonEmptyStr(r.payload['integratorRecordId']) ??
        nonEmptyStr(r.payload['rubitimeRecordId']) ??
        null,
      phone: nonEmptyStr(r.payload['phoneNormalized']) ?? null,
    })),
  };

  if (args.commit && candidates.length > 0) {
    const ids = candidates.map((r) => r.id);
    summary.requeued = await applyOutboxRequeue(db, ids);
  }

  return summary;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const db = createDbPort();
  const defaultRubitimeOffsetMinutes = await getRubitimeRecordAtUtcOffsetMinutesForInstant({
    db,
    instant: new Date(),
  });
  const args = parseArgs(process.argv.slice(2), defaultRubitimeOffsetMinutes);

  const modeLabel = args.mode === 'repair-outbox' ? 'repair-outbox' : 'resync';
  const commitLabel = args.commit ? 'COMMIT' : 'dry-run';

  console.log(
    JSON.stringify(
      {
        mode: modeLabel,
        commit: args.commit,
        run: commitLabel,
        selection: {
          activeDays: args.activeDays,
          canceledDays: args.canceledDays,
          phoneLastN: args.phoneLastN,
          recordIds: args.recordIds.length > 0 ? args.recordIds : undefined,
        },
        runtime: {
          limit: args.limit,
          batchSize: args.batchSize,
          minIntervalMs: args.minIntervalMs,
          retryCount: args.retryCount,
          rubitimeOffsetMinutes: args.rubitimeOffsetMinutes,
          staleThresholdMinutes: args.staleThresholdMinutes,
          sampleSize: args.sampleSize,
        },
      },
      null,
      2,
    ),
  );

  let report: unknown;

  try {
    if (args.mode === 'repair-outbox') {
      const summary = await runRepairOutbox(args, db);
      report = { ok: true, mode: 'repair-outbox', commit: args.commit, summary };
    } else {
      const summary = await runResync(args, db);
      report = { ok: true, mode: 'resync', commit: args.commit, summary };
    }
  } finally {
    await closeDb();
  }

  if (args.reportFile) {
    await writeFile(args.reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[report] written to ${args.reportFile}`);
  }
  console.log(JSON.stringify(report, null, 2));
}

// Guard: only run when this file is the entry point (not imported by tests/modules).
if (process.argv[1] !== undefined) {
  let entryPath: string;
  try {
    entryPath = fileURLToPath(import.meta.url);
  } catch {
    entryPath = '';
  }
  if (
    entryPath !== '' &&
    (process.argv[1] === entryPath ||
      process.argv[1].endsWith('resync-rubitime-records.ts') ||
      process.argv[1].endsWith('resync-rubitime-records.js'))
  ) {
    main().catch((err) => {
      console.error(`resync-rubitime-records failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
  }
}
