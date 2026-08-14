#!/usr/bin/env tsx
/**
 * One-time cutover transition: public.appointment_records -> canonical booking tables.
 *
 * This is deliberately a pre-migration operation. Migration 0262 removes the provider-owned
 * raw tables and migration 0386 removes appointment_records, so the cutover wrapper must run this
 * file before the ordinary migration chain. It does not restore a runtime Rubitime integration.
 *
 * The owner-reviewed CSV is used only as a set of accepted external ids and its covered date
 * range. No CSV PII is written or printed. Writes require --commit and run in one transaction.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { sql, type SQL } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import {
  beAppointmentHistoryEvents,
  beAppointments,
  beExternalEntityMappings,
} from '../db/schema/bookingEngine';

const TEST_BLOCK_PHONES = new Set([
  '+79189000782',
  '+70000000000',
  '+79000000000',
  '+79999999999',
  '+79876543210',
]);
const TEST_BLOCK_NAME_MARKERS = ['тест', 'test', 'дмитрий берсон', 'берсон', 'блок окна'];
const NON_CONFIRMED_STATUSES = new Set([
  'canceled',
  'awaiting_confirmation',
  'in_cart',
  'moved_awaiting',
]);
const NATIVE_APPOINTMENT_KEY = /^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type JsonRecord = Record<string, unknown>;
type NormalizedStatus =
  | 'recorded'
  | 'in_service'
  | 'completed'
  | 'awaiting_prepayment'
  | 'canceled'
  | 'awaiting_confirmation'
  | 'in_cart'
  | 'moved_awaiting';
type CanonicalStatus =
  | 'created'
  | 'awaiting_payment'
  | 'confirmed'
  | 'rescheduled'
  | 'cancelled_by_patient'
  | 'cancelled_by_specialist'
  | 'manual_review_required'
  | 'completed'
  | 'no_show';

type LegacyRow = {
  id: string;
  integrator_record_id: string;
  platform_user_id: string | null;
  phone_normalized: string | null;
  record_at: string | Date | null;
  status: string;
  last_event: string | null;
  payload_json: unknown;
  deleted_at: string | Date | null;
  rubitime_branch_id: string | null;
  mapped_canonical_id: string | null;
  direct_canonical_id: string | null;
};

type Cli = {
  commit: boolean;
  csvPath: string;
  csvSha256: string;
  expectedDatabase: string;
  organizationId: string;
  specialistId: string;
};

type CsvIndex = {
  ids: Set<string>;
  minDay: number;
  maxDay: number;
  sha256: string;
};

type Classification = {
  discardReason: 'test_or_block' | 'non_confirmed' | 'stale_by_owner_csv' | null;
  normalizedStatus: NormalizedStatus | null;
};

type TransitionSummary = {
  legacyTotal: number;
  legacyLiveBefore: number;
  alreadyCanonical: number;
  directCanonical: number;
  discardedTestOrBlock: number;
  discardedNonConfirmed: number;
  discardedStaleByCsv: number;
  projectionCandidates: number;
  inserted: number;
  recovered: number;
  canonicalSoftDeleted: number;
};

function option(name: string): string | undefined {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredOption(name: string): string {
  const value = option(name)?.trim();
  if (!value || value.startsWith('--')) throw new Error(`${name} is required`);
  return value;
}

function parseCli(): Cli {
  const csvSha256 = requiredOption('--csv-sha256').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(csvSha256)) throw new Error('--csv-sha256 must be 64 lowercase hex characters');
  return {
    commit: process.argv.includes('--commit'),
    csvPath: requiredOption('--csv'),
    csvSha256,
    expectedDatabase: requiredOption('--expected-database'),
    organizationId: requiredOption('--organization-id'),
    specialistId: requiredOption('--specialist-id'),
  };
}

/** Minimal RFC4180-style parser for the semicolon-delimited owner export. */
export function parseSemicolonCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ';') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
    } else if (character !== '\r') {
      field += character;
    }
  }
  if (quoted) throw new Error('owner CSV contains an unterminated quoted field');
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseRussianDay(raw: string): number | null {
  const match = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function readCsvIndex(pathname: string, confirmedSha256: string): CsvIndex {
  const bytes = readFileSync(pathname);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== confirmedSha256) throw new Error('owner CSV sha256 does not match --csv-sha256');
  const parsed = parseSemicolonCsv(bytes.toString('utf8'));
  const ids = new Set<string>();
  let minDay = Number.POSITIVE_INFINITY;
  let maxDay = Number.NEGATIVE_INFINITY;
  for (const row of parsed.slice(1)) {
    const externalId = (row[0] ?? '').trim();
    if (externalId) ids.add(externalId);
    const day = parseRussianDay(row[10] ?? '');
    if (day !== null) {
      minDay = Math.min(minDay, day);
      maxDay = Math.max(maxDay, day);
    }
  }
  if (ids.size === 0 || !Number.isFinite(minDay) || !Number.isFinite(maxDay)) {
    throw new Error('owner CSV has no usable ids or appointment date range');
  }
  return { ids, minDay, maxDay, sha256 };
}

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function normalizeLegacyStatus(
  rawStatus: string | number | null | undefined,
  statusTitle?: string | null,
): NormalizedStatus | null {
  const status = (rawStatus ?? '').toString().toLowerCase().trim();
  const title = (statusTitle ?? '').toLowerCase();
  if (['0', 'accepted', 'confirmed', 'recorded'].includes(status)) return 'recorded';
  if (status === '1' || status === 'in_service') return 'in_service';
  if (status === '2' || status === 'completed') return 'completed';
  if (status === '3' || status === 'awaiting_prepayment') return 'awaiting_prepayment';
  if (['4', 'canceled', 'cancelled'].includes(status)) return 'canceled';
  if (status === '5' || status === 'awaiting_confirmation') return 'awaiting_confirmation';
  if (status === '6' || status === 'in_cart') return 'in_cart';
  if (['7', 'moved', 'moved_awaiting'].includes(status)) return 'moved_awaiting';
  if (title.includes('записан')) return 'recorded';
  if (title.includes('отмен')) return 'canceled';
  if (title.includes('ожида') && title.includes('подтвержд')) return 'awaiting_confirmation';
  if (title.includes('перенос')) return 'moved_awaiting';
  if (title.includes('предоплат')) return 'awaiting_prepayment';
  if (title.includes('обслуживан')) return 'in_service';
  if (title.includes('заверш')) return 'completed';
  if (title.includes('корзин')) return 'in_cart';
  return null;
}

export function resolveNormalizedStatus(payloadJson: unknown, legacyStatus: string): NormalizedStatus | null {
  const payload = asRecord(payloadJson);
  const stored = stringValue(payload.rubitime_normalized_status);
  const known = stored ? normalizeLegacyStatus(stored) : null;
  if (known) return known;
  const title = stringValue(payload.status_title) ?? stringValue(payload.status_name);
  const fromPayload = normalizeLegacyStatus(
    stringValue(payload.status) ?? stringValue(payload.rubitime_status_code),
    title,
  );
  if (fromPayload) return fromPayload;
  if (legacyStatus.toLowerCase() === 'canceled') return 'canceled';
  if (legacyStatus.toLowerCase() === 'created') return 'recorded';
  return null;
}

export function mapCanonicalStatus(
  legacyStatus: string,
  lastEvent: string,
  payloadJson: unknown,
): CanonicalStatus {
  const normalized = resolveNormalizedStatus(payloadJson, legacyStatus);
  let mapped: CanonicalStatus;
  switch (normalized) {
    case 'recorded':
    case 'in_service':
      mapped = 'confirmed';
      break;
    case 'completed':
      mapped = 'completed';
      break;
    case 'awaiting_prepayment':
      mapped = 'awaiting_payment';
      break;
    case 'canceled':
      mapped = 'cancelled_by_patient';
      break;
    case 'awaiting_confirmation':
      mapped = 'manual_review_required';
      break;
    case 'in_cart':
      mapped = 'created';
      break;
    case 'moved_awaiting':
      mapped = 'rescheduled';
      break;
    default: {
      const event = lastEvent.toLowerCase();
      if (legacyStatus.toLowerCase() === 'canceled' || event.includes('cancel')) {
        mapped = 'cancelled_by_patient';
      } else if (legacyStatus.toLowerCase() === 'updated' && (event.includes('resched') || event.includes('move'))) {
        mapped = 'rescheduled';
      } else {
        mapped = 'confirmed';
      }
    }
  }
  const event = lastEvent.toLowerCase();
  if (
    mapped === 'cancelled_by_patient' &&
    ['staff', 'specialist', 'admin', 'manual-cancel'].some((marker) => event.includes(marker))
  ) {
    return 'cancelled_by_specialist';
  }
  if (mapped === 'confirmed' && (event.includes('no_show') || event.includes('no-show'))) return 'no_show';
  return mapped;
}

function classifyLegacyRow(row: LegacyRow, csv: CsvIndex): Classification {
  const payload = asRecord(row.payload_json);
  const name = (stringValue(payload.name) ?? stringValue(payload.contact_name) ?? '').toLowerCase();
  const normalizedStatus = resolveNormalizedStatus(row.payload_json, row.status);
  if (
    (row.phone_normalized !== null && TEST_BLOCK_PHONES.has(row.phone_normalized)) ||
    TEST_BLOCK_NAME_MARKERS.some((marker) => name.includes(marker))
  ) {
    return { discardReason: 'test_or_block', normalizedStatus };
  }
  if (normalizedStatus !== null && NON_CONFIRMED_STATUSES.has(normalizedStatus)) {
    return { discardReason: 'non_confirmed', normalizedStatus };
  }
  const recordAt = row.record_at === null ? Number.NaN : new Date(row.record_at).getTime();
  const csvMaxInclusive = csv.maxDay + 86_400_000;
  if (
    Number.isFinite(recordAt) &&
    recordAt >= csv.minDay &&
    recordAt <= csvMaxInclusive &&
    !csv.ids.has(row.integrator_record_id)
  ) {
    return { discardReason: 'stale_by_owner_csv', normalizedStatus };
  }
  return { discardReason: null, normalizedStatus };
}

function durationAndEnd(recordAt: string, payloadJson: unknown): { durationMinutes: number; endAt: string } {
  const payload = asRecord(payloadJson);
  const startMs = new Date(recordAt).getTime();
  const explicitEnd =
    stringValue(payload.datetime_end) ??
    stringValue(payload.date_time_end) ??
    stringValue(payload.slot_end);
  if (explicitEnd) {
    const endMs = new Date(explicitEnd).getTime();
    if (Number.isFinite(endMs) && endMs > startMs) {
      return {
        durationMinutes: Math.max(1, Math.round((endMs - startMs) / 60_000)),
        endAt: new Date(endMs).toISOString(),
      };
    }
  }
  const rawDuration =
    payload.duration_minutes ?? payload.durationMinutes ?? payload.service_duration ?? payload.duration;
  const numericDuration = typeof rawDuration === 'number' ? rawDuration : Number(rawDuration);
  const durationMinutes = Number.isFinite(numericDuration) && numericDuration > 0
    ? Math.round(numericDuration)
    : 60;
  return { durationMinutes, endAt: new Date(startMs + durationMinutes * 60_000).toISOString() };
}

function externalRef(payload: JsonRecord, names: string[]): string | null {
  for (const name of names) {
    const value = stringValue(payload[name]);
    if (value) return value;
  }
  return null;
}

function listSql(values: readonly string[]): SQL {
  if (values.length === 0) throw new Error('cannot build an empty SQL list');
  return sql`(${sql.join(values.map((value) => sql`${value}`), sql`, `)})`;
}

async function main(): Promise<void> {
  const cli = parseCli();
  const csv = readCsvIndex(cli.csvPath, cli.csvSha256);
  const db = getDrizzle();
  const databaseResult = await db.execute<{ database_name: string }>(
    sql`SELECT current_database()::text AS database_name`,
  );
  const databaseName = databaseResult.rows[0]?.database_name ?? '';
  if (databaseName !== cli.expectedDatabase) {
    throw new Error(`current_database() is ${databaseName || '<empty>'}, expected ${cli.expectedDatabase}`);
  }

  const targetResult = await db.execute<{
    organization_exists: boolean;
    specialist_exists: boolean;
    active_specialists: number;
  }>(sql`
    SELECT
      EXISTS(SELECT 1 FROM public.be_organizations WHERE id = ${cli.organizationId}::uuid) AS organization_exists,
      EXISTS(
        SELECT 1 FROM public.be_specialists
        WHERE id = ${cli.specialistId}::uuid
          AND organization_id = ${cli.organizationId}::uuid
          AND is_active = true
      ) AS specialist_exists,
      (
        SELECT count(*)::int FROM public.be_specialists
        WHERE organization_id = ${cli.organizationId}::uuid AND is_active = true
      ) AS active_specialists
  `);
  const target = targetResult.rows[0];
  if (!target?.organization_exists || !target.specialist_exists || target.active_specialists !== 1) {
    throw new Error('cutover organization/specialist anchors do not resolve to exactly one active specialist');
  }

  const readLegacy = async (): Promise<LegacyRow[]> => {
    const result = await db.execute<LegacyRow>(sql`
      SELECT
        legacy.id::text,
        legacy.integrator_record_id,
        legacy.platform_user_id::text,
        legacy.phone_normalized,
        legacy.record_at,
        legacy.status,
        legacy.last_event,
        legacy.payload_json,
        legacy.deleted_at,
        branch.integrator_branch_id::text AS rubitime_branch_id,
        mapping.canonical_id::text AS mapped_canonical_id,
        direct.id::text AS direct_canonical_id
      FROM public.appointment_records legacy
      LEFT JOIN public.branches branch ON branch.id = legacy.branch_id
      LEFT JOIN public.be_external_entity_mappings mapping
        ON mapping.external_system = 'rubitime'
       AND mapping.entity_type = 'appointment'
       AND mapping.external_id = legacy.integrator_record_id
      LEFT JOIN public.be_appointments direct
        ON direct.id = CASE
          WHEN legacy.integrator_record_id ~ '^be:[0-9a-fA-F-]{36}$'
          THEN substring(legacy.integrator_record_id FROM 4)::uuid
        END
      ORDER BY legacy.record_at NULLS LAST, legacy.id
    `);
    return result.rows;
  };

  const initialRows = await readLegacy();
  const liveRows = initialRows.filter((row) => row.deleted_at === null && row.record_at !== null);
  const classifications = new Map(liveRows.map((row) => [row.id, classifyLegacyRow(row, csv)]));
  const discarded = liveRows.filter((row) => classifications.get(row.id)?.discardReason !== null);
  const projectionCandidates = liveRows.filter((row) => {
    const classification = classifications.get(row.id);
    return (
      classification?.discardReason === null &&
      row.mapped_canonical_id === null &&
      row.direct_canonical_id === null &&
      !NATIVE_APPOINTMENT_KEY.test(row.integrator_record_id)
    );
  });
  const summary: TransitionSummary = {
    legacyTotal: initialRows.length,
    legacyLiveBefore: liveRows.length,
    alreadyCanonical: liveRows.filter((row) => row.mapped_canonical_id !== null).length,
    directCanonical: liveRows.filter((row) => row.direct_canonical_id !== null).length,
    discardedTestOrBlock: discarded.filter((row) => classifications.get(row.id)?.discardReason === 'test_or_block').length,
    discardedNonConfirmed: discarded.filter((row) => classifications.get(row.id)?.discardReason === 'non_confirmed').length,
    discardedStaleByCsv: discarded.filter((row) => classifications.get(row.id)?.discardReason === 'stale_by_owner_csv').length,
    projectionCandidates: projectionCandidates.length,
    inserted: 0,
    recovered: 0,
    canonicalSoftDeleted: 0,
  };

  console.log(JSON.stringify({
    mode: cli.commit ? 'commit' : 'dry-run',
    database: databaseName,
    csv: { ids: csv.ids.size, minDay: new Date(csv.minDay).toISOString().slice(0, 10), maxDay: new Date(csv.maxDay).toISOString().slice(0, 10), sha256: csv.sha256 },
    before: summary,
  }));
  if (!cli.commit) return;

  await db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE public.appointment_records IN SHARE ROW EXCLUSIVE MODE`);
    await tx.execute(sql`LOCK TABLE public.be_appointments IN SHARE ROW EXCLUSIVE MODE`);
    await tx.execute(sql`LOCK TABLE public.be_external_entity_mappings IN SHARE ROW EXCLUSIVE MODE`);

    const lockedResult = await tx.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total FROM public.appointment_records
    `);
    if ((lockedResult.rows[0]?.total ?? -1) !== initialRows.length) {
      throw new Error('appointment_records changed between preview and locked transaction');
    }

    const discardedIds = discarded.map((row) => row.id);
    const discardedExternalIds = discarded.map((row) => row.integrator_record_id);
    if (discardedIds.length > 0) {
      await tx.execute(sql`
        UPDATE public.appointment_records
        SET deleted_at = now()
        WHERE deleted_at IS NULL AND id::text IN ${listSql(discardedIds)}
      `);
      const softDeleted = await tx.execute<{ id: string }>(sql`
        UPDATE public.be_appointments appointment
        SET deleted_at = now(), updated_at = now()
        WHERE appointment.deleted_at IS NULL
          AND appointment.source = 'rubitime_projection'
          AND appointment.id IN (
            SELECT mapping.canonical_id
            FROM public.be_external_entity_mappings mapping
            WHERE mapping.external_system = 'rubitime'
              AND mapping.entity_type = 'appointment'
              AND mapping.external_id IN ${listSql(discardedExternalIds)}
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.be_external_entity_mappings live_mapping
            JOIN public.appointment_records live_legacy
              ON live_legacy.integrator_record_id = live_mapping.external_id
             AND live_legacy.deleted_at IS NULL
            WHERE live_mapping.external_system = 'rubitime'
              AND live_mapping.entity_type = 'appointment'
              AND live_mapping.canonical_id = appointment.id
          )
        RETURNING appointment.id::text
      `);
      summary.canonicalSoftDeleted = softDeleted.rows.length;
    }

    const mappingResult = await tx.execute<{
      entity_type: string;
      external_id: string;
      canonical_id: string;
    }>(sql`
      SELECT entity_type, external_id, canonical_id::text
      FROM public.be_external_entity_mappings
      WHERE external_system = 'rubitime'
    `);
    const mappingLookup = new Map(
      mappingResult.rows.map((row) => [`${row.entity_type}:${row.external_id}`, row.canonical_id]),
    );

    for (const row of projectionCandidates) {
      if (row.record_at === null) throw new Error('projection candidate unexpectedly has no record_at');
      const startAt = new Date(row.record_at).toISOString();
      const payload = { ...asRecord(row.payload_json) };
      if (row.rubitime_branch_id && payload.branch_id === undefined) payload.branch_id = row.rubitime_branch_id;
      const { durationMinutes, endAt } = durationAndEnd(startAt, payload);
      const branchExternalId = externalRef(payload, ['branch_id', 'rubitime_branch_id', 'branchId']);
      const serviceExternalId = externalRef(payload, ['service_id', 'rubitime_service_id']);
      const branchId = branchExternalId ? mappingLookup.get(`branch:${branchExternalId}`) ?? null : null;
      const serviceId = serviceExternalId
        ? mappingLookup.get(`service:${serviceExternalId}`) ?? mappingLookup.get(`availability:${serviceExternalId}`) ?? null
        : null;
      const recoverResult = await tx.execute<{ id: string }>(sql`
        SELECT id::text
        FROM public.be_appointments
        WHERE organization_id = ${cli.organizationId}::uuid
          AND source = 'rubitime_projection'
          AND start_at BETWEEN ${new Date(new Date(startAt).getTime() - 120_000).toISOString()}::timestamptz
                           AND ${new Date(new Date(startAt).getTime() + 120_000).toISOString()}::timestamptz
          AND end_at BETWEEN ${new Date(new Date(endAt).getTime() - 120_000).toISOString()}::timestamptz
                         AND ${new Date(new Date(endAt).getTime() + 120_000).toISOString()}::timestamptz
          AND (${row.phone_normalized}::text IS NULL OR phone_normalized IS NOT DISTINCT FROM ${row.phone_normalized}::text)
        ORDER BY
          (specialist_id IS NOT DISTINCT FROM ${cli.specialistId}::uuid) DESC,
          abs(extract(epoch FROM (start_at - ${startAt}::timestamptz))) ASC,
          updated_at DESC
        LIMIT 1
      `);
      let appointmentId = recoverResult.rows[0]?.id;
      const now = new Date().toISOString();
      const eventPayload = {
        externalId: row.integrator_record_id,
        legacyStatus: row.status,
        lastEvent: row.last_event ?? '',
        scopeOverrideReason: 'owner_pre_webapp_history_canonical_specialist',
      };
      if (appointmentId) {
        await tx.update(beAppointments).set({
          branchId,
          specialistId: cli.specialistId,
          serviceId,
          platformUserId: row.platform_user_id,
          startAt,
          endAt,
          durationMinutes,
          status: mapCanonicalStatus(row.status, row.last_event ?? '', payload),
          phoneNormalized: row.phone_normalized,
          updatedAt: now,
        }).where(sql`${beAppointments.id} = ${appointmentId}::uuid`);
        summary.recovered += 1;
      } else {
        // This operation runs before the ordinary migration chain. The current Drizzle model already
        // contains chain/reminder columns that do not exist in the fresh PROD schema, and a Drizzle insert
        // enumerates those columns even when their values are defaults. Keep this one transition insert on
        // the exact source/target column intersection; later migrations add the new nullable/default fields.
        const inserted = await tx.execute<{ id: string }>(sql`
          INSERT INTO public.be_appointments (
            organization_id,
            branch_id,
            specialist_id,
            service_id,
            platform_user_id,
            start_at,
            end_at,
            duration_minutes,
            source,
            status,
            original_start_at,
            reschedule_count,
            phone_normalized,
            attribution_json,
            created_at,
            updated_at
          ) VALUES (
            ${cli.organizationId}::uuid,
            ${branchId}::uuid,
            ${cli.specialistId}::uuid,
            ${serviceId}::uuid,
            ${row.platform_user_id}::uuid,
            ${startAt}::timestamptz,
            ${endAt}::timestamptz,
            ${durationMinutes}::integer,
            'rubitime_projection',
            ${mapCanonicalStatus(row.status, row.last_event ?? '', payload)},
            ${startAt}::timestamptz,
            0,
            ${row.phone_normalized}::text,
            ${JSON.stringify({ importedBy: 'owner_reviewed_legacy_cutover', importedAt: now })}::jsonb,
            ${now}::timestamptz,
            ${now}::timestamptz
          )
          RETURNING id::text
        `);
        appointmentId = inserted.rows[0]?.id;
        if (!appointmentId) throw new Error('canonical appointment insert returned no id');
        summary.inserted += 1;
      }
      await tx.insert(beExternalEntityMappings).values({
        organizationId: cli.organizationId,
        entityType: 'appointment',
        canonicalId: appointmentId,
        externalSystem: 'rubitime',
        externalId: row.integrator_record_id,
        metadata: {
          projectedFrom: 'owner_reviewed_legacy_cutover',
          sourceTable: 'appointment_records',
          ownerCsvSha256: csv.sha256,
          recoveredExistingAppointment: recoverResult.rows.length > 0,
        },
        createdAt: now,
        updatedAt: now,
      });
      await tx.execute(sql`
        INSERT INTO public.be_appointment_events (
          organization_id, appointment_id, event_type, payload
        ) VALUES (
          ${cli.organizationId}::uuid,
          ${appointmentId}::uuid,
          'legacy_cutover_imported',
          ${JSON.stringify(eventPayload)}::jsonb
        )
      `);
      await tx.insert(beAppointmentHistoryEvents).values({
        organizationId: cli.organizationId,
        appointmentId,
        eventType: 'legacy_cutover_imported',
        payload: eventPayload,
        occurredAt: now,
      });
    }

    const unresolved = await tx.execute<{ count: number }>(sql`
      SELECT count(*)::int AS count
      FROM public.appointment_records legacy
      LEFT JOIN public.be_external_entity_mappings mapping
        ON mapping.external_system = 'rubitime'
       AND mapping.entity_type = 'appointment'
       AND mapping.external_id = legacy.integrator_record_id
      LEFT JOIN public.be_appointments direct
        ON direct.id = CASE
          WHEN legacy.integrator_record_id ~ '^be:[0-9a-fA-F-]{36}$'
          THEN substring(legacy.integrator_record_id FROM 4)::uuid
        END
      WHERE legacy.deleted_at IS NULL
        AND legacy.record_at IS NOT NULL
        AND mapping.canonical_id IS NULL
        AND direct.id IS NULL
    `);
    if ((unresolved.rows[0]?.count ?? -1) !== 0) {
      throw new Error(`legacy cutover left ${unresolved.rows[0]?.count ?? 'unknown'} live unresolved appointments`);
    }

    const invalidLiveMappings = await tx.execute<{ count: number }>(sql`
      SELECT count(*)::int AS count
      FROM public.appointment_records legacy
      JOIN public.be_external_entity_mappings mapping
        ON mapping.external_system = 'rubitime'
       AND mapping.entity_type = 'appointment'
       AND mapping.external_id = legacy.integrator_record_id
      LEFT JOIN public.be_appointments appointment ON appointment.id = mapping.canonical_id
      WHERE legacy.deleted_at IS NULL
        AND (appointment.id IS NULL OR appointment.deleted_at IS NOT NULL)
    `);
    if ((invalidLiveMappings.rows[0]?.count ?? -1) !== 0) {
      throw new Error('legacy cutover left live rows mapped to missing or deleted canonical appointments');
    }

    const rawUnmapped = await tx.execute<{ count: number }>(sql`
      SELECT count(*)::int AS count
      FROM integrator.rubitime_records raw
      LEFT JOIN public.be_external_entity_mappings mapping
        ON mapping.external_system = 'rubitime'
       AND mapping.entity_type = 'appointment'
       AND mapping.external_id = raw.rubitime_record_id
      WHERE mapping.canonical_id IS NULL
    `);
    if ((rawUnmapped.rows[0]?.count ?? -1) !== 0) {
      throw new Error(`legacy cutover left ${rawUnmapped.rows[0]?.count ?? 'unknown'} raw Rubitime records unmapped`);
    }
  });

  console.log(JSON.stringify({ mode: 'commit', database: databaseName, after: summary }));
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (isDirectExecution) {
  main().catch((error: unknown) => {
    const databaseError = error as {
      code?: unknown;
      constraint?: unknown;
      table?: unknown;
      column?: unknown;
      cause?: { code?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    };
    const cause = databaseError.cause ?? databaseError;
    const safeIdentifier = (value: unknown): string | undefined =>
      typeof value === 'string' && /^[a-z_][a-z0-9_]{0,62}$/u.test(value) ? value : undefined;
    console.error(JSON.stringify({
      ok: false,
      error: 'legacy_appointment_cutover_failed',
      sqlstate: typeof cause.code === 'string' && /^[0-9A-Z]{5}$/u.test(cause.code)
        ? cause.code
        : undefined,
      constraint: safeIdentifier(cause.constraint),
      table: safeIdentifier(cause.table),
      column: safeIdentifier(cause.column),
    }));
    process.exitCode = 1;
  });
}
