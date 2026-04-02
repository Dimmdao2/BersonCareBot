/**
 * Read-only audit: compares local integrator rubitime_records with Rubitime API get-record.
 *
 * Selection policy (default):
 * - active statuses (created/updated): last 30 days
 * - canceled status: last 60 days
 *
 * Usage:
 *   pnpm --dir apps/integrator run rubitime:compare-records
 *   pnpm --dir apps/integrator run rubitime:compare-records -- --limit=200 --batch-size=50 --min-interval-ms=5200
 */
import '../../config/loadEnv.js';
import { writeFile } from 'node:fs/promises';
import { getRubitimeRecordAtUtcOffsetMinutesForInstant } from '../../config/appTimezone.js';
import { createDbPort, closeDb } from '../db/client.js';
import { fetchRubitimeRecordById } from '../../integrations/rubitime/client.js';

type Args = {
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
  failOnMismatch: boolean;
};

type LocalRow = {
  id: number;
  rubitime_record_id: string;
  phone_normalized: string | null;
  record_at: Date | null;
  status: 'created' | 'updated' | 'canceled';
  payload_json: unknown;
  updated_at: Date | null;
  created_at: Date | null;
};

type ComparisonResult =
  | {
    kind: 'ok';
    recordId: string;
  }
  | {
    kind: 'mismatch';
    recordId: string;
    reasons: string[];
  }
  | {
    kind: 'api_error';
    recordId: string;
    error: string;
  }
  | {
    kind: 'not_found';
    recordId: string;
    localStatus: LocalRow['status'];
    error: string;
  };

type Summary = {
  scanned: number;
  compared: number;
  matches: number;
  mismatches: number;
  apiErrors: number;
  notFound: number;
  notFoundActive: number;
  notFoundCanceled: number;
  samples: {
    mismatches: Array<{ recordId: string; reasons: string[] }>;
    apiErrors: Array<{ recordId: string; error: string }>;
    notFound: Array<{ recordId: string; localStatus: LocalRow['status']; error: string }>;
  };
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function parsePositiveInt(raw: string | undefined, fallback: number, min = 1, max = 1_000_000): number {
  if (!raw || raw.length === 0) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const int = Math.trunc(n);
  return Math.max(min, Math.min(max, int));
}

function parseArgs(argv: string[]): Args {
  const lookup = (prefix: string): string | undefined => {
    const item = argv.find((x) => x.startsWith(prefix));
    return item ? item.slice(prefix.length) : undefined;
  };

  return {
    activeDays: parsePositiveInt(lookup('--active-days='), 30, 1, 3650),
    canceledDays: parsePositiveInt(lookup('--canceled-days='), 60, 1, 3650),
    limit: parsePositiveInt(lookup('--limit='), 0, 0, 10_000_000),
    batchSize: parsePositiveInt(lookup('--batch-size='), 200, 1, 5000),
    concurrency: parsePositiveInt(lookup('--concurrency='), 3, 1, 50),
    minIntervalMs: parsePositiveInt(lookup('--min-interval-ms='), 5200, 0, 60_000),
    retryCount: parsePositiveInt(lookup('--retry-count='), 2, 0, 20),
    retryBaseMs: parsePositiveInt(lookup('--retry-base-ms='), 5500, 100, 120_000),
    rubitimeOffsetMinutes: parsePositiveInt(
      lookup('--rubitime-offset-minutes='),
      Number.isFinite(env.RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES) ? env.RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES : 180,
      -720,
      840,
    ),
    staleThresholdMinutes: parsePositiveInt(lookup('--stale-threshold-minutes='), 120, 1, 10080),
    sampleSize: parsePositiveInt(lookup('--sample-size='), 25, 1, 1000),
    reportFile: asNonEmptyString(lookup('--report-file=')),
    failOnMismatch: argv.includes('--fail-on-mismatch'),
  };
}

function normalizePhoneForCompare(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('9')) return `7${digits}`;
  return digits;
}

function dateToIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && value.trim().length > 0) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function rubitimeMaybeDateToIso(value: unknown, offsetMinutes: number): string | null {
  const s = asNonEmptyString(value);
  if (!s) return null;
  const hasExplicitZone = /Z$/i.test(s) || /[+-]\d{2}:\d{2}$/.test(s);
  if (hasExplicitZone) {
    const zoned = new Date(s);
    if (!Number.isNaN(zoned.getTime())) return zoned.toISOString();
    return null;
  }

  const naiveLocal = /^\d{4}-\d{2}-\d{2}(?: |T)\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(s);
  if (naiveLocal) {
    const isoLocal = s.includes('T') ? s : s.replace(' ', 'T');
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMinutes);
    const oh = String(Math.floor(abs / 60)).padStart(2, '0');
    const om = String(abs % 60).padStart(2, '0');
    const withZone = new Date(`${isoLocal}${sign}${oh}:${om}`);
    if (!Number.isNaN(withZone.getTime())) return withZone.toISOString();
    return null;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

function valuesEqualLoose(a: unknown, b: unknown): boolean {
  const sa = a == null ? null : String(a).trim();
  const sb = b == null ? null : String(b).trim();
  return sa === sb;
}

function isRubitimeCanceled(remote: Record<string, unknown>): boolean {
  const status = asNonEmptyString(remote.status)?.toLowerCase() ?? '';
  const statusTitle = asNonEmptyString(remote.status_title)?.toLowerCase() ?? '';
  return status === '4' || status === 'canceled' || status === 'cancelled' || statusTitle.includes('отмен');
}

function compareRow(
  local: LocalRow,
  remote: Record<string, unknown>,
  offsetMinutes: number,
  staleThresholdMinutes: number,
): string[] {
  const reasons: string[] = [];
  const recordId = String(local.rubitime_record_id);
  const remoteId = asNonEmptyString(remote.id) ?? (remote.id != null ? String(remote.id) : null);
  if (!valuesEqualLoose(recordId, remoteId)) {
    reasons.push(`id mismatch local=${recordId} remote=${remoteId ?? 'null'}`);
  }

  const localPhone = normalizePhoneForCompare(local.phone_normalized);
  const remotePhone = normalizePhoneForCompare(asNonEmptyString(remote.phone));
  if (localPhone && remotePhone && localPhone !== remotePhone) {
    reasons.push(`phone mismatch local=${local.phone_normalized} remote=${asNonEmptyString(remote.phone)}`);
  }

  const localCanceled = local.status === 'canceled';
  const remoteCanceled = isRubitimeCanceled(remote);
  if (localCanceled !== remoteCanceled) {
    reasons.push(`status mismatch local=${local.status} remoteStatus=${asNonEmptyString(remote.status) ?? 'null'}`);
  }

  const localRecordAtIso = dateToIso(local.record_at);
  const remoteRecordAtIso = rubitimeMaybeDateToIso(remote.record ?? remote.datetime, offsetMinutes);
  if (localRecordAtIso && remoteRecordAtIso) {
    const diffMin = Math.round((Date.parse(remoteRecordAtIso) - Date.parse(localRecordAtIso)) / 60_000);
    if (diffMin !== 0) {
      reasons.push(`record_at mismatch diffMin=${diffMin} local=${localRecordAtIso} remote=${remoteRecordAtIso}`);
    }
  }

  const localPayload = asRecord(local.payload_json);
  const fieldsToCheck: Array<{ key: string; local: unknown; remote: unknown }> = [
    { key: 'branch_id', local: localPayload.branch_id, remote: remote.branch_id },
    { key: 'service_id', local: localPayload.service_id, remote: remote.service_id },
    { key: 'name', local: localPayload.name, remote: remote.name },
    { key: 'email', local: localPayload.email, remote: remote.email },
  ];
  for (const field of fieldsToCheck) {
    const localValue = field.local == null ? null : String(field.local).trim();
    const remoteValue = field.remote == null ? null : String(field.remote).trim();
    if (localValue && remoteValue && localValue !== remoteValue) {
      reasons.push(`${field.key} mismatch local=${localValue} remote=${remoteValue}`);
    }
  }

  const localUpdatedAtIso = dateToIso(local.updated_at);
  const remoteUpdatedAtIso = rubitimeMaybeDateToIso(remote.updated_at, offsetMinutes);
  if (localUpdatedAtIso && remoteUpdatedAtIso) {
    const localTs = Date.parse(localUpdatedAtIso);
    const remoteTs = Date.parse(remoteUpdatedAtIso);
    const diffMin = Math.round((remoteTs - localTs) / 60_000);
    if (Number.isFinite(localTs) && Number.isFinite(remoteTs) && diffMin > staleThresholdMinutes) {
      reasons.push(`stale diffMin=${diffMin} local=${localUpdatedAtIso} remote=${remoteUpdatedAtIso}`);
    }
  }

  return reasons;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
      const idx = next;
      next += 1;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx] as T);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function isRateLimitError(message: string): boolean {
  return message.toLowerCase().includes('limit on the number of consecutive requests');
}

function isNotFoundError(message: string): boolean {
  return message.toLowerCase().includes('record not found');
}

function classifyApiError(message: string): 'rate_limit' | 'not_found' | 'other' {
  if (isNotFoundError(message)) return 'not_found';
  if (isRateLimitError(message)) return 'rate_limit';
  return 'other';
}

async function fetchBatch(input: {
  db: ReturnType<typeof createDbPort>;
  lastId: number;
  activeDays: number;
  canceledDays: number;
  batchSize: number;
  remainingLimit: number;
}): Promise<LocalRow[]> {
  const effectiveBatchSize = input.remainingLimit > 0
    ? Math.min(input.batchSize, input.remainingLimit)
    : input.batchSize;
  if (effectiveBatchSize <= 0) return [];

  const sql = `
    SELECT
      id,
      rubitime_record_id,
      phone_normalized,
      record_at,
      status,
      payload_json,
      updated_at,
      created_at
    FROM rubitime_records
    WHERE id > $1
      AND (
        (
          status IN ('created', 'updated')
          AND COALESCE(updated_at, record_at, created_at) >= now() - ($2::int * interval '1 day')
        )
        OR (
          status = 'canceled'
          AND COALESCE(updated_at, record_at, created_at) >= now() - ($3::int * interval '1 day')
        )
      )
    ORDER BY id ASC
    LIMIT $4
  `;

  const res = await input.db.query<LocalRow>(sql, [
    input.lastId,
    input.activeDays,
    input.canceledDays,
    effectiveBatchSize,
  ]);
  return res.rows;
}

let nextAllowedRequestAt = 0;

async function waitForRateWindow(minIntervalMs: number): Promise<void> {
  if (minIntervalMs <= 0) return;
  const now = Date.now();
  const waitMs = nextAllowedRequestAt - now;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  nextAllowedRequestAt = Date.now() + minIntervalMs;
}

async function fetchRubitimeRecordWithRetry(input: {
  recordId: string;
  minIntervalMs: number;
  retryCount: number;
  retryBaseMs: number;
}): Promise<Record<string, unknown>> {
  let attempt = 0;
  const maxAttempts = input.retryCount + 1;
  while (attempt < maxAttempts) {
    await waitForRateWindow(input.minIntervalMs);
    try {
      return asRecord(await fetchRubitimeRecordById({ recordId: input.recordId }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorType = classifyApiError(message);
      attempt += 1;
      if (errorType === 'rate_limit' && attempt < maxAttempts) {
        const delayMs = input.retryBaseMs * Math.pow(2, attempt - 1);
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error('unexpected_retries_exit');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = createDbPort();
  if (args.minIntervalMs > 0 && args.concurrency > 1) {
    console.warn(
      `[warn] min-interval-ms=${args.minIntervalMs} is enabled, forcing concurrency=1 for safe rate limiting`,
    );
  }
  const effectiveConcurrency = args.minIntervalMs > 0 ? 1 : args.concurrency;
  const summary: Summary = {
    scanned: 0,
    compared: 0,
    matches: 0,
    mismatches: 0,
    apiErrors: 0,
    notFound: 0,
    notFoundActive: 0,
    notFoundCanceled: 0,
    samples: {
      mismatches: [],
      apiErrors: [],
      notFound: [],
    },
  };

  console.log(
    JSON.stringify(
      {
        mode: 'read-only',
        selection: {
          activeDays: args.activeDays,
          canceledDays: args.canceledDays,
        },
        runtime: {
          limit: args.limit,
          batchSize: args.batchSize,
          concurrency: effectiveConcurrency,
          minIntervalMs: args.minIntervalMs,
          retryCount: args.retryCount,
          retryBaseMs: args.retryBaseMs,
          rubitimeOffsetMinutes: args.rubitimeOffsetMinutes,
          staleThresholdMinutes: args.staleThresholdMinutes,
          sampleSize: args.sampleSize,
        },
      },
      null,
      2,
    ),
  );

  let lastId = 0;
  let remainingLimit = args.limit;

  try {
    while (true) {
      const batch = await fetchBatch({
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
      if (remainingLimit > 0) {
        remainingLimit -= batch.length;
      }

      const batchResults = await mapWithConcurrency(
        batch,
        effectiveConcurrency,
        async (row): Promise<ComparisonResult> => {
          const recordId = String(row.rubitime_record_id);
          try {
            const remote = await fetchRubitimeRecordWithRetry({
              recordId,
              minIntervalMs: args.minIntervalMs,
              retryCount: args.retryCount,
              retryBaseMs: args.retryBaseMs,
            });
            const reasons = compareRow(
              row,
              remote,
              args.rubitimeOffsetMinutes,
              args.staleThresholdMinutes,
            );
            if (reasons.length === 0) return { kind: 'ok', recordId };
            return { kind: 'mismatch', recordId, reasons };
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            if (isNotFoundError(error)) {
              return { kind: 'not_found', recordId, localStatus: row.status, error };
            }
            return { kind: 'api_error', recordId, error };
          }
        },
      );

      for (const result of batchResults) {
        summary.compared += 1;
        if (result.kind === 'ok') {
          summary.matches += 1;
          continue;
        }
        if (result.kind === 'mismatch') {
          summary.mismatches += 1;
          if (summary.samples.mismatches.length < args.sampleSize) {
            summary.samples.mismatches.push({ recordId: result.recordId, reasons: result.reasons });
          }
          continue;
        }
        if (result.kind === 'not_found') {
          summary.notFound += 1;
          if (result.localStatus === 'canceled') summary.notFoundCanceled += 1;
          if (result.localStatus === 'created' || result.localStatus === 'updated') summary.notFoundActive += 1;
          if (summary.samples.notFound.length < args.sampleSize) {
            summary.samples.notFound.push({
              recordId: result.recordId,
              localStatus: result.localStatus,
              error: result.error,
            });
          }
          continue;
        }
        summary.apiErrors += 1;
        if (summary.samples.apiErrors.length < args.sampleSize) {
          summary.samples.apiErrors.push({ recordId: result.recordId, error: result.error });
        }
      }

      console.log(
        `[progress] scanned=${summary.scanned} compared=${summary.compared} matches=${summary.matches} mismatches=${summary.mismatches} notFound=${summary.notFound} (active=${summary.notFoundActive}, canceled=${summary.notFoundCanceled}) apiErrors=${summary.apiErrors}`,
      );

      if (args.limit > 0 && remainingLimit <= 0) break;
    }
  } finally {
    await closeDb();
  }

  const report = {
    ok: true,
    mode: 'read-only',
    selection: {
      activeDays: args.activeDays,
      canceledDays: args.canceledDays,
    },
    runtime: {
      limit: args.limit,
      batchSize: args.batchSize,
      concurrency: effectiveConcurrency,
      minIntervalMs: args.minIntervalMs,
      retryCount: args.retryCount,
      retryBaseMs: args.retryBaseMs,
      rubitimeOffsetMinutes: args.rubitimeOffsetMinutes,
      staleThresholdMinutes: args.staleThresholdMinutes,
      sampleSize: args.sampleSize,
    },
    summary,
  };

  if (args.reportFile) {
    await writeFile(args.reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[report] written to ${args.reportFile}`);
  }

  console.log(JSON.stringify(report, null, 2));

  if (args.failOnMismatch && (summary.mismatches > 0 || summary.apiErrors > 0 || summary.notFound > 0)) {
    process.exit(2);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`compare-rubitime-records failed: ${message}`);
  process.exit(1);
});
