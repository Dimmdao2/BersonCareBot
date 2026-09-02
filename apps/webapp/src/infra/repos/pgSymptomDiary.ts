/**
 * PostgreSQL implementation of SymptomDiaryPort.
 * Tables: symptom_trackings, symptom_entries (see webapp/migrations/004_symptom_trackings_and_entries.sql).
 */
import { sql } from 'drizzle-orm';
import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
} from '@bersoncare/db-principal';
import { getWebappSqlDb, runWebappNamedRoot, runWebappSql } from '@/infra/db/runWebappSql';
import { platformUserMatchSql } from '@/infra/repos/platformUserMatchSql';
import { nullableToIsoStringSafe, toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import {
  type DrizzleTxExecute,
  upsertWarmupFeelingTrackingIdInTx as upsertWarmupFeelingTrackingSql,
} from '@/infra/repos/warmupFeelingTrackingTx';
import type { SymptomDiaryPort } from '@/modules/diaries/ports';
import type { SymptomEntry, SymptomTracking } from '@/modules/diaries/types';

type SymptomTrackingRow = {
  id: string;
  user_id: string;
  platform_user_id?: string | null;
  symptom_key: string | null;
  symptom_title: string;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  symptom_type_ref_id?: string | null;
  region_ref_id?: string | null;
  side?: string | null;
  diagnosis_text?: string | null;
  diagnosis_ref_id?: string | null;
  stage_ref_id?: string | null;
  deleted_at?: Date | string | null;
  organization_id?: string | null;
};

function rowToTracking(row: SymptomTrackingRow): SymptomTracking {
  const uid =
    row.platform_user_id != null && String(row.platform_user_id).trim() !== ''
      ? String(row.platform_user_id)
      : row.user_id;
  return {
    id: String(row.id),
    userId: uid,
    symptomKey: row.symptom_key,
    symptomTitle: row.symptom_title,
    isActive: row.is_active,
    createdAt: toIsoStringSafe(row.created_at),
    updatedAt: toIsoStringSafe(row.updated_at),
    symptomTypeRefId: row.symptom_type_ref_id ? String(row.symptom_type_ref_id) : null,
    regionRefId: row.region_ref_id ? String(row.region_ref_id) : null,
    side: (row.side as SymptomTracking['side']) ?? null,
    diagnosisText: row.diagnosis_text ?? null,
    diagnosisRefId: row.diagnosis_ref_id ? String(row.diagnosis_ref_id) : null,
    stageRefId: row.stage_ref_id ? String(row.stage_ref_id) : null,
    deletedAt: nullableToIsoStringSafe(row.deleted_at),
  };
}

type SymptomEntryRow = {
  id: string;
  user_id: string;
  platform_user_id?: string | null;
  tracking_id: string;
  value_0_10: number;
  entry_type: string;
  recorded_at: Date | string;
  source: string;
  notes: string | null;
  created_at: Date | string;
  symptom_title?: string;
};

function rowToEntry(row: SymptomEntryRow): SymptomEntry {
  const uid =
    row.platform_user_id != null && String(row.platform_user_id).trim() !== ''
      ? String(row.platform_user_id)
      : row.user_id;
  return {
    id: String(row.id),
    userId: uid,
    trackingId: row.tracking_id,
    value0_10: row.value_0_10,
    entryType: row.entry_type as 'instant' | 'daily',
    recordedAt: toIsoStringSafe(row.recorded_at),
    source: row.source as 'bot' | 'webapp' | 'import',
    notes: row.notes,
    createdAt: toIsoStringSafe(row.created_at),
    ...(row.symptom_title != null && { symptomTitle: row.symptom_title }),
  };
}

const TRACKING_SELECT = `id, user_id, platform_user_id, symptom_key, symptom_title, is_active, created_at, updated_at,
    symptom_type_ref_id, region_ref_id, side, diagnosis_text, diagnosis_ref_id, stage_ref_id, deleted_at, organization_id`;

/** Match legacy text user_id or canonical platform_user_id (post-merge / backfill). */
function isPatientPrincipal(): boolean {
  return getCurrentDbPrincipal()?.kind === 'patient';
}

async function ensureCurrentPatientSystemTracking(params: {
  symptomKey: 'general_wellbeing' | 'warmup_feeling';
  symptomTitle: string;
  symptomTypeRefId: string;
}): Promise<SymptomTracking> {
  const args = [params.symptomKey, params.symptomTitle, params.symptomTypeRefId] as const;
  const result = await runWebappNamedRoot<{ tracking: SymptomTrackingRow }>(
    getWebappSqlDb(),
    'app.ensure_current_patient_system_symptom_tracking(text,text,uuid)',
    args,
    sql`SELECT app.ensure_current_patient_system_symptom_tracking(
      ${params.symptomKey}::text, ${params.symptomTitle}::text, ${params.symptomTypeRefId}::uuid
    ) AS tracking`,
  );
  const row = result.rows[0]?.tracking;
  if (!row) throw new Error('current_patient_system_symptom_tracking_rejected');
  return rowToTracking(row);
}

async function configureCurrentPatientAssignedTracking(params: {
  trackingId: string;
  title: string | null;
  isActive: boolean | null;
}): Promise<void> {
  const args = [params.trackingId, params.title, params.isActive] as const;
  const result = await runWebappNamedRoot<{ updated: boolean }>(
    getWebappSqlDb(),
    'app.configure_current_patient_assigned_symptom_tracking(uuid,text,boolean)',
    args,
    sql`SELECT app.configure_current_patient_assigned_symptom_tracking(
      ${params.trackingId}::uuid, ${params.title}::text, ${params.isActive}::boolean
    ) AS updated`,
  );
  if (result.rows[0]?.updated !== true) throw new Error('assigned_symptom_tracking_rejected');
}

export const pgSymptomDiaryPort: SymptomDiaryPort = {
  async createTracking(params) {
    if (isPatientPrincipal()) throw new Error('patient_self_create_disabled');
    const now = new Date();
    const organizationId = getCurrentDbPrincipalOrganizationId() ?? null;
    const result = await runWebappSql<SymptomTrackingRow>(
      getWebappSqlDb(),
      sql`INSERT INTO symptom_trackings (
         user_id, platform_user_id, organization_id, symptom_key, symptom_title, is_active, updated_at,
         symptom_type_ref_id, region_ref_id, side, diagnosis_text, diagnosis_ref_id, stage_ref_id
       )
       VALUES (${params.userId}::text, ${params.userId}::uuid, ${sql.param(organizationId)}::uuid, ${params.symptomKey ?? null}, ${params.symptomTitle}, true, ${now}, ${params.symptomTypeRefId ?? null}, ${params.regionRefId ?? null}, ${params.side ?? null}, ${params.diagnosisText ?? null}, ${params.diagnosisRefId ?? null}, ${params.stageRefId ?? null})
       RETURNING ${sql.raw(TRACKING_SELECT)}`,
    );
    return rowToTracking(result.rows[0]);
  },

  async ensureGeneralWellbeingTracking(params) {
    if (isPatientPrincipal()) {
      return ensureCurrentPatientSystemTracking({
        symptomKey: 'general_wellbeing',
        symptomTitle: params.symptomTitle,
        symptomTypeRefId: params.symptomTypeRefId,
      });
    }
    const now = new Date();
    const result = await runWebappSql<SymptomTrackingRow>(
      getWebappSqlDb(),
      sql`INSERT INTO symptom_trackings (
         user_id, platform_user_id, symptom_key, symptom_title, is_active, updated_at,
         symptom_type_ref_id, region_ref_id, side, diagnosis_text, diagnosis_ref_id, stage_ref_id
       )
       VALUES (${params.userId}::text, ${params.userId}::uuid, 'general_wellbeing', ${params.symptomTitle}, true, ${now}, ${params.symptomTypeRefId}::uuid, NULL, NULL, NULL, NULL, NULL)
       ON CONFLICT (platform_user_id) WHERE (
         symptom_key = 'general_wellbeing'
         AND deleted_at IS NULL
         AND platform_user_id IS NOT NULL
       )
       DO UPDATE SET updated_at = symptom_trackings.updated_at
       RETURNING ${sql.raw(TRACKING_SELECT)}`,
    );
    return rowToTracking(result.rows[0]);
  },

  async ensureWarmupFeelingTracking(params) {
    if (isPatientPrincipal()) {
      return ensureCurrentPatientSystemTracking({
        symptomKey: 'warmup_feeling',
        symptomTitle: params.symptomTitle,
        symptomTypeRefId: params.symptomTypeRefId,
      });
    }
    const now = new Date();
    const result = await runWebappSql<SymptomTrackingRow>(
      getWebappSqlDb(),
      sql`INSERT INTO symptom_trackings (
         user_id, platform_user_id, symptom_key, symptom_title, is_active, updated_at,
         symptom_type_ref_id, region_ref_id, side, diagnosis_text, diagnosis_ref_id, stage_ref_id
       )
       VALUES (${params.userId}::text, ${params.userId}::uuid, 'warmup_feeling', ${params.symptomTitle}, true, ${now}, ${params.symptomTypeRefId}::uuid, NULL, NULL, NULL, NULL, NULL)
       ON CONFLICT (platform_user_id) WHERE (
         symptom_key = 'warmup_feeling'
         AND deleted_at IS NULL
         AND platform_user_id IS NOT NULL
       )
       DO UPDATE SET updated_at = symptom_trackings.updated_at
       RETURNING ${sql.raw(TRACKING_SELECT)}`,
    );
    return rowToTracking(result.rows[0]);
  },

  async upsertWarmupFeelingTrackingIdInTx(tx, params) {
    return upsertWarmupFeelingTrackingSql(tx as DrizzleTxExecute, params);
  },

  async listTrackings(userId, activeOnly = true) {
    const result = await runWebappSql<SymptomTrackingRow>(
      getWebappSqlDb(),
      sql`SELECT ${sql.raw(TRACKING_SELECT)}
       FROM symptom_trackings t
       WHERE ${platformUserMatchSql('t', userId)} AND deleted_at IS NULL
       ${sql.raw(activeOnly ? 'AND is_active = true' : '')}
       ORDER BY updated_at DESC`,
    );
    return result.rows.map(rowToTracking);
  },

  async addEntry(params) {
    const recordedAt = new Date(params.recordedAt);
    if (isPatientPrincipal()) {
      const args = [
        params.trackingId,
        params.value0_10,
        params.entryType,
        recordedAt,
        params.notes ?? null,
      ] as const;
      const result = await runWebappNamedRoot<{ entry: SymptomEntryRow }>(
        getWebappSqlDb(),
        'app.record_current_patient_symptom_entry(uuid,integer,text,timestamp with time zone,text)',
        args,
        sql`SELECT app.record_current_patient_symptom_entry(
          ${params.trackingId}::uuid,
          ${params.value0_10}::integer,
          ${params.entryType}::text,
          ${recordedAt}::timestamptz,
          ${params.notes ?? null}::text
        ) AS entry`,
      );
      const row = result.rows[0]?.entry;
      if (!row) throw new Error('current_patient_symptom_entry_rejected');
      const tracking = await runWebappSql<{ symptom_title: string }>(
        getWebappSqlDb(),
        sql`SELECT symptom_title FROM symptom_trackings WHERE id = ${params.trackingId}`,
      );
      return rowToEntry({ ...row, symptom_title: tracking.rows[0]?.symptom_title });
    }
    const ppcId = params.patientPracticeCompletionId ?? null;
    const result =
      ppcId != null && ppcId !== ''
        ? await runWebappSql<SymptomEntryRow>(
            getWebappSqlDb(),
            sql`INSERT INTO symptom_entries (
               user_id, platform_user_id, tracking_id, value_0_10, entry_type, recorded_at, source, notes,
               patient_practice_completion_id
             )
             VALUES (${params.userId}::text, ${params.userId}::uuid, ${params.trackingId}, ${params.value0_10}, ${params.entryType}, ${recordedAt}, ${params.source}, ${params.notes ?? null}, ${ppcId}::uuid)
             RETURNING id, user_id, platform_user_id, tracking_id, value_0_10, entry_type, recorded_at, source, notes, created_at`,
          )
        : await runWebappSql<SymptomEntryRow>(
            getWebappSqlDb(),
            sql`INSERT INTO symptom_entries (user_id, platform_user_id, tracking_id, value_0_10, entry_type, recorded_at, source, notes)
             VALUES (${params.userId}::text, ${params.userId}::uuid, ${params.trackingId}, ${params.value0_10}, ${params.entryType}, ${recordedAt}, ${params.source}, ${params.notes ?? null})
             RETURNING id, user_id, platform_user_id, tracking_id, value_0_10, entry_type, recorded_at, source, notes, created_at`,
          );
    const row = result.rows[0]!;
    const tracking = await runWebappSql<{ symptom_title: string }>(
      getWebappSqlDb(),
      sql`SELECT symptom_title FROM symptom_trackings WHERE id = ${params.trackingId}`,
    );
    return rowToEntry({
      ...row,
      symptom_title: tracking.rows[0]?.symptom_title,
    });
  },

  async listEntries(userId, limit = 50) {
    const result = await runWebappSql<SymptomEntryRow>(
      getWebappSqlDb(),
      sql`SELECT e.id, e.user_id, e.platform_user_id, e.tracking_id, e.value_0_10, e.entry_type, e.recorded_at, e.source, e.notes, e.created_at,
              t.symptom_title
       FROM symptom_entries e
       JOIN symptom_trackings t ON t.id = e.tracking_id
       WHERE ${platformUserMatchSql('e', userId)} AND t.deleted_at IS NULL
       ORDER BY e.recorded_at DESC
       LIMIT ${limit}`,
    );
    return result.rows.map(rowToEntry);
  },

  async getTrackingForUser(params) {
    const result = await runWebappSql<SymptomTrackingRow>(
      getWebappSqlDb(),
      sql`SELECT ${sql.raw(TRACKING_SELECT)}
       FROM symptom_trackings
       WHERE id = ${params.trackingId} AND ${platformUserMatchSql(null, params.userId)} AND deleted_at IS NULL`,
    );
    return result.rows[0] ? rowToTracking(result.rows[0]) : null;
  },

  async listEntriesForTrackingInRange(params) {
    const result = await runWebappSql<SymptomEntryRow>(
      getWebappSqlDb(),
      sql`SELECT e.id, e.user_id, e.platform_user_id, e.tracking_id, e.value_0_10, e.entry_type, e.recorded_at, e.source, e.notes, e.created_at,
              t.symptom_title
       FROM symptom_entries e
       JOIN symptom_trackings t ON t.id = e.tracking_id
       WHERE ${platformUserMatchSql('e', params.userId)} AND e.tracking_id = ${params.trackingId}
         AND e.recorded_at >= ${params.fromRecordedAt}::timestamptz AND e.recorded_at < ${params.toRecordedAtExclusive}::timestamptz
         AND t.deleted_at IS NULL
       ORDER BY e.recorded_at ASC`,
    );
    return result.rows.map(rowToEntry);
  },

  async listEntriesForUserInRange(params) {
    const lim = Math.min(params.limit ?? 500, 2000);
    const tid = params.trackingId?.trim();
    const result = await runWebappSql<SymptomEntryRow>(
      getWebappSqlDb(),
      sql`SELECT e.id, e.user_id, e.platform_user_id, e.tracking_id, e.value_0_10, e.entry_type, e.recorded_at, e.source, e.notes, e.created_at,
              t.symptom_title
       FROM symptom_entries e
       JOIN symptom_trackings t ON t.id = e.tracking_id
       WHERE ${platformUserMatchSql('e', params.userId)}
         AND e.recorded_at >= ${params.fromRecordedAt}::timestamptz AND e.recorded_at < ${params.toRecordedAtExclusive}::timestamptz
         AND t.deleted_at IS NULL
         ${tid ? sql`AND e.tracking_id = ${tid}::uuid` : sql``}
       ORDER BY e.recorded_at DESC
       LIMIT ${lim}`,
    );
    return result.rows.map(rowToEntry);
  },

  async minRecordedAtForTracking(params) {
    const result = await runWebappSql<{ m: Date | string | null }>(
      getWebappSqlDb(),
      sql`SELECT MIN(e.recorded_at) AS m
       FROM symptom_entries e
       JOIN symptom_trackings t ON t.id = e.tracking_id
       WHERE ${platformUserMatchSql('e', params.userId)} AND e.tracking_id = ${params.trackingId} AND t.deleted_at IS NULL`,
    );
    const m = result.rows[0]?.m;
    return nullableToIsoStringSafe(m);
  },

  async getEntryForUser(params) {
    const result = await runWebappSql<SymptomEntryRow>(
      getWebappSqlDb(),
      sql`SELECT e.id, e.user_id, e.platform_user_id, e.tracking_id, e.value_0_10, e.entry_type, e.recorded_at, e.source, e.notes, e.created_at,
              t.symptom_title
       FROM symptom_entries e
       JOIN symptom_trackings t ON t.id = e.tracking_id
       WHERE e.id = ${params.entryId} AND ${platformUserMatchSql('e', params.userId)} AND t.deleted_at IS NULL`,
    );
    return result.rows[0] ? rowToEntry(result.rows[0]) : null;
  },

  async updateEntry(params) {
    if (isPatientPrincipal()) {
      const args = [
        params.entryId,
        params.value0_10,
        params.entryType,
        params.recordedAt,
        params.notes,
      ] as const;
      const result = await runWebappNamedRoot<{ entry: SymptomEntryRow }>(
        getWebappSqlDb(),
        'app.update_current_patient_symptom_entry(uuid,integer,text,timestamp with time zone,text)',
        args,
        sql`SELECT app.update_current_patient_symptom_entry(
          ${params.entryId}::uuid,
          ${params.value0_10}::integer,
          ${params.entryType}::text,
          ${params.recordedAt}::timestamptz,
          ${params.notes}::text
        ) AS entry`,
      );
      if (!result.rows[0]?.entry) throw new Error('current_patient_symptom_entry_not_editable');
      return;
    }
    await runWebappSql(
      getWebappSqlDb(),
      sql`UPDATE symptom_entries e
       SET value_0_10 = ${params.value0_10}, entry_type = ${params.entryType}, recorded_at = ${params.recordedAt}::timestamptz, notes = ${params.notes}
       FROM symptom_trackings t
       WHERE e.id = ${params.entryId} AND ${platformUserMatchSql('e', params.userId)} AND e.tracking_id = t.id AND t.deleted_at IS NULL`,
    );
  },

  async deleteEntry(params) {
    if (isPatientPrincipal()) {
      const result = await runWebappNamedRoot<{ deleted: boolean }>(
        getWebappSqlDb(),
        'app.delete_current_patient_symptom_entry(uuid)',
        [params.entryId],
        sql`SELECT app.delete_current_patient_symptom_entry(${params.entryId}::uuid) AS deleted`,
      );
      if (result.rows[0]?.deleted !== true) {
        throw new Error('current_patient_symptom_entry_not_editable');
      }
      return;
    }
    await runWebappSql(
      getWebappSqlDb(),
      sql`DELETE FROM symptom_entries e
       USING symptom_trackings t
       WHERE e.id = ${params.entryId} AND ${platformUserMatchSql('e', params.userId)} AND e.tracking_id = t.id AND t.deleted_at IS NULL`,
    );
  },

  async updateTrackingTitle(params) {
    if (isPatientPrincipal()) {
      await configureCurrentPatientAssignedTracking({
        trackingId: params.trackingId,
        title: params.symptomTitle,
        isActive: null,
      });
      return;
    }
    await runWebappSql(
      getWebappSqlDb(),
      sql`UPDATE symptom_trackings SET symptom_title = ${params.symptomTitle}, updated_at = now()
       WHERE id = ${params.trackingId} AND ${platformUserMatchSql(null, params.userId)} AND deleted_at IS NULL`,
    );
  },

  async setTrackingActive(params) {
    if (isPatientPrincipal()) {
      await configureCurrentPatientAssignedTracking({
        trackingId: params.trackingId,
        title: null,
        isActive: params.isActive,
      });
      return;
    }
    await runWebappSql(
      getWebappSqlDb(),
      sql`UPDATE symptom_trackings SET is_active = ${params.isActive}, updated_at = now()
       WHERE id = ${params.trackingId} AND ${platformUserMatchSql(null, params.userId)} AND deleted_at IS NULL`,
    );
  },

  async softDeleteTracking(params) {
    if (isPatientPrincipal()) {
      await configureCurrentPatientAssignedTracking({
        trackingId: params.trackingId,
        title: null,
        isActive: false,
      });
      return;
    }
    await runWebappSql(
      getWebappSqlDb(),
      sql`UPDATE symptom_trackings SET is_active = false, deleted_at = now(), updated_at = now()
       WHERE id = ${params.trackingId} AND ${platformUserMatchSql(null, params.userId)} AND deleted_at IS NULL`,
    );
  },
};
