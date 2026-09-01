/**
 * PostgreSQL implementation of LfkDiaryPort.
 * Tables: lfk_complexes, lfk_sessions (see webapp/migrations/005_lfk_complexes_and_sessions.sql).
 */
import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
} from '@bersoncare/db-principal';
import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot, runWebappSql } from '@/infra/db/runWebappSql';
import { platformUserMatchSql } from '@/infra/repos/platformUserMatchSql';
import { nullableToIsoStringSafe, toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import type { MediaPreviewStatus } from '@/modules/media/types';
import type { LfkDiaryPort } from '@/modules/diaries/ports';
import type { LfkComplex, LfkComplexExerciseLine, LfkSession } from '@/modules/diaries/types';
import { effectiveLfkComplexExerciseComment } from '@/modules/diaries/lfkComplexExerciseComment';
import { mediaPreviewUrlById } from '@/shared/lib/mediaPreviewUrls';

function rowToComplex(row: {
  id: string;
  user_id: string;
  platform_user_id?: string | null;
  title: string;
  cover_image_url?: string | null;
  cover_media_type?: string | null;
  cover_media_id?: string | null;
  preview_sm_key?: string | null;
  preview_md_key?: string | null;
  preview_status?: string | null;
  origin: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  symptom_tracking_id?: string | null;
  region_ref_id?: string | null;
  side?: string | null;
  diagnosis_text?: string | null;
  diagnosis_ref_id?: string | null;
}): LfkComplex {
  const uid =
    row.platform_user_id != null && String(row.platform_user_id).trim() !== ''
      ? String(row.platform_user_id)
      : row.user_id;
  const mid = row.cover_media_id ? String(row.cover_media_id) : null;
  const coverPreviewSmUrl =
    mid && row.preview_sm_key?.trim() ? mediaPreviewUrlById(mid, 'sm') : null;
  const coverPreviewMdUrl =
    mid && row.preview_md_key?.trim() ? mediaPreviewUrlById(mid, 'md') : null;
  const coverPreviewStatus = (row.preview_status ?? undefined) as MediaPreviewStatus | undefined;
  const coverKind =
    mid && row.cover_media_type === 'video'
      ? ('video' as const)
      : mid
        ? ('image' as const)
        : undefined;
  return {
    id: String(row.id),
    userId: uid,
    title: row.title,
    coverImageUrl: row.cover_image_url ?? null,
    coverPreviewSmUrl,
    coverPreviewMdUrl,
    coverPreviewStatus,
    coverKind,
    origin: row.origin as 'manual' | 'assigned_by_specialist',
    isActive: row.is_active,
    createdAt: toIsoStringSafe(row.created_at),
    updatedAt: toIsoStringSafe(row.updated_at),
    symptomTrackingId: row.symptom_tracking_id ? String(row.symptom_tracking_id) : null,
    regionRefId: row.region_ref_id ? String(row.region_ref_id) : null,
    side: (row.side as LfkComplex['side']) ?? null,
    diagnosisText: row.diagnosis_text ?? null,
    diagnosisRefId: row.diagnosis_ref_id ? String(row.diagnosis_ref_id) : null,
  };
}

function rowToSession(row: {
  id: string;
  user_id: string;
  complex_id: string;
  completed_at: Date | string;
  source: string;
  created_at: Date | string;
  complex_title?: string;
  recorded_at?: Date | string | null;
  duration_minutes?: number | null;
  difficulty_0_10?: number | null;
  pain_0_10?: number | null;
  comment?: string | null;
}): LfkSession {
  return {
    id: String(row.id),
    userId: row.user_id,
    complexId: row.complex_id,
    completedAt: toIsoStringSafe(row.completed_at),
    source: row.source as 'bot' | 'webapp',
    createdAt: toIsoStringSafe(row.created_at),
    recordedAt: nullableToIsoStringSafe(row.recorded_at),
    durationMinutes: row.duration_minutes ?? null,
    difficulty0_10: row.difficulty_0_10 ?? null,
    pain0_10: row.pain_0_10 ?? null,
    comment: row.comment ?? null,
    ...(row.complex_title != null && { complexTitle: row.complex_title }),
  };
}

type LfkSessionDbRow = Parameters<typeof rowToSession>[0];
type LfkComplexDbRow = Parameters<typeof rowToComplex>[0];

type LfkSessionInsertDbRow = Omit<LfkSessionDbRow, 'complex_title'>;

type CurrentPatientLfkSessionResult = {
  ok: boolean;
  code?: string;
  session?: LfkSessionDbRow | null;
  sessions?: LfkSessionDbRow[];
  completed_at?: Date | string | null;
  updated?: boolean;
  deleted?: boolean;
};

const COMPLEX_SELECT = `c.id, c.user_id, c.title,
  c.platform_user_id,
  cover.cover_image_url,
  cover.cover_media_type,
  cover.cover_media_id,
  cover.preview_sm_key,
  cover.preview_md_key,
  cover.preview_status,
  c.origin, c.is_active, c.created_at, c.updated_at,
  c.symptom_tracking_id, c.region_ref_id, c.side, c.diagnosis_text, c.diagnosis_ref_id`;
const COMPLEX_RETURNING = `id, user_id, title,
  platform_user_id,
  NULL::text AS cover_image_url,
  origin, is_active, created_at, updated_at,
  symptom_tracking_id, region_ref_id, side, diagnosis_text, diagnosis_ref_id`;

const SESSION_SELECT = `s.id, s.user_id, s.complex_id, s.completed_at, s.source, s.created_at, c.title AS complex_title,
  s.recorded_at, s.duration_minutes, s.difficulty_0_10, s.pain_0_10, s.comment`;

const PATIENT_COMPLEX_COVER_JOIN =
  'LEFT JOIN LATERAL app.read_patient_lfk_complex_cover(c.id) AS cover ON TRUE';

const STAFF_COMPLEX_COVER_JOIN = `LEFT JOIN LATERAL (
  SELECT em.media_url AS cover_image_url,
         em.media_type AS cover_media_type,
         mf.id AS cover_media_id,
         mf.preview_sm_key, mf.preview_md_key, mf.preview_status
  FROM lfk_complex_exercises ce
  INNER JOIN lfk_exercise_media em ON em.exercise_id = ce.exercise_id
  LEFT JOIN media_files mf ON mf.id = NULLIF(
    substring(trim(em.media_url) from '^/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'),
    ''
  )::uuid
  WHERE ce.complex_id = c.id
  ORDER BY ce.sort_order ASC, em.sort_order ASC, em.created_at ASC
  LIMIT 1
) cover ON TRUE`;

function complexCoverJoinForCurrentPrincipal(): string {
  return getCurrentDbPrincipal()?.kind === 'patient'
    ? PATIENT_COMPLEX_COVER_JOIN
    : STAFF_COMPLEX_COVER_JOIN;
}

function isCurrentPatientPrincipal(): boolean {
  return getCurrentDbPrincipal()?.kind === 'patient';
}

async function currentPatientLfkSessions(
  action: 'list' | 'list_range' | 'min_completed_at' | 'get' | 'create' | 'update' | 'delete',
  payload: Record<string, unknown> = {},
): Promise<CurrentPatientLfkSessionResult> {
  const payloadJson = JSON.stringify(payload);
  const result = await runWebappNamedRoot<{ result: CurrentPatientLfkSessionResult }>(
    getWebappSqlDb(),
    'app.current_patient_lfk_sessions(text,text)',
    [action, payloadJson],
    sql`SELECT app.current_patient_lfk_sessions(${action}::text, ${payloadJson}::text) AS result`,
  );
  const value = result.rows[0]?.result;
  if (!value?.ok) {
    throw new Error(value?.code ?? 'current_patient_lfk_session_failed');
  }
  return value;
}

export const pgLfkDiaryPort: LfkDiaryPort = {
  async createComplex(params) {
    const now = new Date();
    const result = await runWebappSql<LfkComplexDbRow>(
      getWebappSqlDb(),
      sql`INSERT INTO lfk_complexes (
         user_id, platform_user_id, title, origin, is_active, updated_at,
         symptom_tracking_id, region_ref_id, side, diagnosis_text, diagnosis_ref_id
       )
       VALUES (${params.userId}::text, ${params.userId}::uuid, ${params.title}, ${params.origin ?? 'manual'}, true, ${now}, ${params.symptomTrackingId ?? null}, ${params.regionRefId ?? null}, ${params.side ?? null}, ${params.diagnosisText ?? null}, ${params.diagnosisRefId ?? null})
       RETURNING ${sql.raw(COMPLEX_RETURNING)}`,
    );
    return rowToComplex(result.rows[0]!);
  },

  async listComplexes(userId, activeOnly = true) {
    const result = await runWebappSql<LfkComplexDbRow>(
      getWebappSqlDb(),
      sql`SELECT ${sql.raw(COMPLEX_SELECT)}
       FROM lfk_complexes c
       ${sql.raw(complexCoverJoinForCurrentPrincipal())}
       WHERE ${platformUserMatchSql('c', userId)} ${sql.raw(activeOnly ? 'AND c.is_active = true' : '')}
       ORDER BY c.updated_at DESC`,
    );
    return result.rows.map(rowToComplex);
  },

  async addSession(params) {
    const completedAt = new Date(params.completedAt);
    const recordedAt = params.recordedAt ? new Date(params.recordedAt) : completedAt;
    if (isCurrentPatientPrincipal()) {
      const result = await currentPatientLfkSessions('create', {
        complex_id: params.complexId,
        completed_at: completedAt.toISOString(),
        recorded_at: recordedAt.toISOString(),
        duration_minutes: params.durationMinutes ?? null,
        difficulty_0_10: params.difficulty0_10 ?? null,
        pain_0_10: params.pain0_10 ?? null,
        comment: params.comment ?? null,
      });
      if (!result.session) throw new Error('current_patient_lfk_session_create_failed');
      return rowToSession(result.session);
    }
    const result = await runWebappSql<LfkSessionInsertDbRow>(
      getWebappSqlDb(),
      sql`INSERT INTO lfk_sessions (
         user_id, complex_id, completed_at, source, recorded_at,
         duration_minutes, difficulty_0_10, pain_0_10, comment
       )
       VALUES (${params.userId}, ${params.complexId}, ${completedAt}, ${params.source}, ${recordedAt}, ${params.durationMinutes ?? null}, ${params.difficulty0_10 ?? null}, ${params.pain0_10 ?? null}, ${params.comment ?? null})
       RETURNING id, user_id, complex_id, completed_at, source, created_at,
         recorded_at, duration_minutes, difficulty_0_10, pain_0_10, comment`,
    );
    const row = result.rows[0]!;
    const complex = await runWebappSql<{ title: string }>(
      getWebappSqlDb(),
      sql`SELECT title FROM lfk_complexes WHERE id = ${params.complexId}`,
    );
    return rowToSession({
      ...row,
      complex_title: complex.rows[0]?.title,
    });
  },

  async listSessions(userId, limit = 50) {
    if (isCurrentPatientPrincipal()) {
      const result = await currentPatientLfkSessions('list', { limit });
      return (result.sessions ?? []).map(rowToSession);
    }
    const result = await runWebappSql<LfkSessionDbRow>(
      getWebappSqlDb(),
      sql`SELECT ${sql.raw(SESSION_SELECT)}
       FROM lfk_sessions s
       JOIN lfk_complexes c ON c.id = s.complex_id
       WHERE s.user_id = ${userId}
       ORDER BY s.completed_at DESC
       LIMIT ${limit}`,
    );
    return result.rows.map(rowToSession);
  },

  async getComplexForUser(params) {
    const result = await runWebappSql<LfkComplexDbRow>(
      getWebappSqlDb(),
      sql`SELECT ${sql.raw(COMPLEX_SELECT)}
       FROM lfk_complexes c
       ${sql.raw(complexCoverJoinForCurrentPrincipal())}
       WHERE c.id = ${params.complexId} AND ${platformUserMatchSql('c', params.userId)}`,
    );
    return result.rows[0] ? rowToComplex(result.rows[0]) : null;
  },

  async listSessionsInRange(params) {
    const lim = Math.min(params.limit ?? 2000, 5000);
    if (isCurrentPatientPrincipal()) {
      const result = await currentPatientLfkSessions('list_range', {
        from_completed_at: params.fromCompletedAt,
        to_completed_at_exclusive: params.toCompletedAtExclusive,
        complex_id: params.complexId ?? null,
        limit: lim,
      });
      return (result.sessions ?? []).map(rowToSession);
    }
    const orgCondition = params.organizationId
      ? sql`AND s.organization_id = ${params.organizationId}::uuid`
      : sql``;
    if (params.complexId) {
      const result = await runWebappSql<LfkSessionDbRow>(
        getWebappSqlDb(),
        sql`SELECT ${sql.raw(SESSION_SELECT)}
         FROM lfk_sessions s
         JOIN lfk_complexes c ON c.id = s.complex_id
         WHERE s.user_id = ${params.userId} AND s.complex_id = ${params.complexId}
           AND s.completed_at >= ${params.fromCompletedAt}::timestamptz AND s.completed_at < ${params.toCompletedAtExclusive}::timestamptz
           ${orgCondition}
         ORDER BY s.completed_at DESC
         LIMIT ${lim}`,
      );
      return result.rows.map(rowToSession);
    }
    const result = await runWebappSql<LfkSessionDbRow>(
      getWebappSqlDb(),
      sql`SELECT ${sql.raw(SESSION_SELECT)}
       FROM lfk_sessions s
       JOIN lfk_complexes c ON c.id = s.complex_id
       WHERE s.user_id = ${params.userId}
         AND s.completed_at >= ${params.fromCompletedAt}::timestamptz AND s.completed_at < ${params.toCompletedAtExclusive}::timestamptz
         ${orgCondition}
       ORDER BY s.completed_at DESC
       LIMIT ${lim}`,
    );
    return result.rows.map(rowToSession);
  },

  async minCompletedAtForUser(userId) {
    if (isCurrentPatientPrincipal()) {
      const result = await currentPatientLfkSessions('min_completed_at');
      return nullableToIsoStringSafe(result.completed_at);
    }
    const result = await runWebappSql<{ m: Date | string | null }>(
      getWebappSqlDb(),
      sql`SELECT MIN(completed_at) AS m FROM lfk_sessions WHERE user_id = ${userId}`,
    );
    const m = result.rows[0]?.m as Date | string | null | undefined;
    return nullableToIsoStringSafe(m);
  },

  async getSessionForUser(params) {
    if (isCurrentPatientPrincipal()) {
      const result = await currentPatientLfkSessions('get', { session_id: params.sessionId });
      return result.session ? rowToSession(result.session) : null;
    }
    const result = await runWebappSql<LfkSessionDbRow>(
      getWebappSqlDb(),
      sql`SELECT ${sql.raw(SESSION_SELECT)}
       FROM lfk_sessions s
       JOIN lfk_complexes c ON c.id = s.complex_id
       WHERE s.id = ${params.sessionId} AND s.user_id = ${params.userId}`,
    );
    return result.rows[0] ? rowToSession(result.rows[0]) : null;
  },

  async updateSession(params) {
    let comment = params.comment?.trim() ?? null;
    if (comment && comment.length > 200) comment = comment.slice(0, 200);
    if (isCurrentPatientPrincipal()) {
      const result = await currentPatientLfkSessions('update', {
        session_id: params.sessionId,
        completed_at: params.completedAt,
        duration_minutes: params.durationMinutes ?? null,
        difficulty_0_10: params.difficulty0_10 ?? null,
        pain_0_10: params.pain0_10 ?? null,
        comment,
      });
      if (!result.updated) throw new Error('current_patient_lfk_session_not_found');
      return;
    }
    await runWebappSql(
      getWebappSqlDb(),
      sql`UPDATE lfk_sessions
       SET completed_at = ${params.completedAt}::timestamptz,
           duration_minutes = ${params.durationMinutes ?? null},
           difficulty_0_10 = ${params.difficulty0_10 ?? null},
           pain_0_10 = ${params.pain0_10 ?? null},
           comment = ${comment}
       WHERE id = ${params.sessionId} AND user_id = ${params.userId}`,
    );
  },

  async deleteSession(params) {
    if (isCurrentPatientPrincipal()) {
      const result = await currentPatientLfkSessions('delete', { session_id: params.sessionId });
      if (!result.deleted) throw new Error('current_patient_lfk_session_not_found');
      return;
    }
    await runWebappSql(
      getWebappSqlDb(),
      sql`DELETE FROM lfk_sessions WHERE id = ${params.sessionId} AND user_id = ${params.userId}`,
    );
  },

  async listLfkComplexExerciseLinesForUser(params: {
    userId: string;
    complexIds: string[];
  }): Promise<Record<string, LfkComplexExerciseLine[]>> {
    if (params.complexIds.length === 0) return {};
    const isPatientPrincipal = getCurrentDbPrincipal()?.kind === 'patient';
    const result = await runWebappSql<{
      complex_id: string;
      id: string;
      sort_order: number;
      exercise_title: string;
      comment: string | null;
      local_comment: string | null;
    }>(
      getWebappSqlDb(),
      isPatientPrincipal
        ? sql`SELECT complex_id, id, sort_order, exercise_title, comment, local_comment
           FROM app.read_patient_lfk_complex_exercise_lines(${sql.param(params.complexIds)}::uuid[])`
        : sql`SELECT ce.complex_id, ce.id, ce.sort_order,
                  COALESCE(NULLIF(trim(e.title), ''), 'Упражнение') AS exercise_title,
                  ce.comment, ce.local_comment
           FROM lfk_complex_exercises ce
           INNER JOIN lfk_exercises e ON e.id = ce.exercise_id
           INNER JOIN lfk_complexes c ON c.id = ce.complex_id
           WHERE ce.complex_id = ANY(${sql.param(params.complexIds)}::uuid[])
             AND ${platformUserMatchSql('c', params.userId)}
           ORDER BY ce.complex_id, ce.sort_order ASC, ce.id ASC`,
    );
    const byComplex: Record<string, LfkComplexExerciseLine[]> = {};
    for (const row of result.rows) {
      const cid = String(row.complex_id);
      const snap = row.comment ?? null;
      const loc = row.local_comment ?? null;
      const line: LfkComplexExerciseLine = {
        id: String(row.id),
        complexId: cid,
        sortOrder: row.sort_order,
        exerciseTitle: row.exercise_title,
        templateCommentSnapshot: snap,
        localComment: loc,
        effectiveComment: effectiveLfkComplexExerciseComment({ comment: snap, localComment: loc }),
      };
      if (!byComplex[cid]) byComplex[cid] = [];
      byComplex[cid]!.push(line);
    }
    return byComplex;
  },

  async updateLfkComplexExerciseLocalCommentForUser(params: {
    userId: string;
    rowId: string;
    localComment: string | null;
  }): Promise<void> {
    const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
    const r = await runWebappSql(
      getWebappSqlDb(),
      sql`UPDATE lfk_complex_exercises ce
       SET local_comment = ${params.localComment}
       FROM lfk_complexes c
       WHERE ce.id = ${params.rowId}::uuid
         AND ce.complex_id = c.id
         AND ${platformUserMatchSql('c', params.userId)}
         AND (${principalOrganizationId}::uuid IS NULL OR c.organization_id = ${principalOrganizationId}::uuid)`,
    );
    if (r.rowCount === 0) {
      throw new Error('Строка упражнения не найдена или нет доступа');
    }
  },
};
