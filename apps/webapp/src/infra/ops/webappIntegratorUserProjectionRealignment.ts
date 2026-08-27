/**
 * ONE list of the webapp projection tables that still carry the retired `integrator_user_id`,
 * plus their CANONICAL platform-user key.
 *
 * Readers of this single list:
 *  - Stage 4 realignment (loser integrator_user_id → winner) and its gate diagnostics
 *    (`scripts/realign-webapp-integrator-user-projection.ts`,
 *    `docs/archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/sql/realign_webapp_integrator_user_id.sql`);
 *  - the retired-id reconcile CLI (`scripts/user-phone-admin.ts webapp-cleanup-by-integrator-id`);
 *  - the account purge (`@/infra/platformUserFullPurge`), which deletes by `platformUserColumn` and
 *    NEVER depends on a retired integrator id being present.
 *
 * Why one list: a projection table added here without a canonical-key delete is exactly audit finding
 * C1 (`docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`) — a full account purge that
 * silently keeps reminder history for every user whose retired integrator id was already dropped.
 * `platformUserFullPurge.purgeCoverageForRetiredIntegratorProjections()` is the mechanical gate.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DECIMAL_INTEGRATOR_USER_ID = /^\d+$/;

export type MergePair = { winner: string; loser: string };

export type WebappLoserGateParamMode = 'psql' | 'nodePg';

function loserIdParamToken(mode: WebappLoserGateParamMode): string {
  return mode === 'psql' ? ":'loser_id'" : '$1';
}

export type WebappRetiredIntegratorIdProjection = {
  /** Physical `public` table holding the projection rows. */
  table: string;
  /** Canonical owner key. The account purge deletes by THIS column, not by the retired id. */
  platformUserColumn: string;
  /** Extra predicate the retired-id gate needs on top of `integrator_user_id::text = <param>`. */
  retiredIdNotNullGuard?: true;
};

/**
 * The single census of retired-integrator-id projections. Order is the realignment job order
 * (children before the conversation root).
 */
export const WEBAPP_RETIRED_INTEGRATOR_ID_PROJECTIONS: readonly WebappRetiredIntegratorIdProjection[] =
  [
    { table: 'reminder_rules', platformUserColumn: 'platform_user_id' },
    { table: 'reminder_occurrence_history', platformUserColumn: 'platform_user_id' },
    { table: 'content_access_grants_webapp', platformUserColumn: 'platform_user_id' },
    {
      table: 'support_conversations',
      platformUserColumn: 'platform_user_id',
      retiredIdNotNullGuard: true,
    },
  ] as const;

/** Specs for gate: loser integrator_user_id counts (same tables as realignment UPDATE targets). */
export const WEBAPP_INTEGRATOR_USER_ID_GATE_TABLE_SPECS = WEBAPP_RETIRED_INTEGRATOR_ID_PROJECTIONS.map(
  (projection) => ({
    table: projection.table,
    whereClause: (p: string) =>
      projection.retiredIdNotNullGuard
        ? `integrator_user_id IS NOT NULL AND integrator_user_id::text = ${p}`
        : `integrator_user_id::text = ${p}`,
  }),
);

/** Tables touched by rekey UPDATE (after subscription/mailing dedup DELETEs). Order matches job script. */
export const WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES =
  WEBAPP_RETIRED_INTEGRATOR_ID_PROJECTIONS.map((projection) => projection.table);

/**
 * UNION ALL branches for gate diagnostics (no outer wrapper).
 * psql: use in `diagnostics_webapp_integrator_user_id.sql` via `fullDiagnosticsWebappIntegratorUserIdSqlFileBody()`.
 * nodePg: one placeholder `$1` for loser id (text form).
 */
export function buildWebappLoserIntegratorUserIdGateUnionSql(
  mode: WebappLoserGateParamMode,
): string {
  const p = loserIdParamToken(mode);
  return WEBAPP_INTEGRATOR_USER_ID_GATE_TABLE_SPECS.map(
    (spec) =>
      `SELECT '${spec.table}' AS tbl, COUNT(*)::bigint AS cnt\nFROM ${spec.table} WHERE ${spec.whereClause(p)}`,
  ).join('\nUNION ALL\n');
}

/** Wrapped query for `pg` client (ordered result). */
export function buildWebappLoserIntegratorUserIdDiagnosticsSqlNodePg(): string {
  const inner = buildWebappLoserIntegratorUserIdGateUnionSql('nodePg');
  return `SELECT tbl, cnt FROM (\n${inner}\n) q\nORDER BY tbl`;
}

const DIAGNOSTICS_FILE_HEADER = `-- Диагностика webapp: наличие конкретного integrator_user_id (loser) в projection-таблицах
-- Использование: webapp DB (webapp.prod DATABASE_URL).
-- Перед запуском: \\set loser_id '123456789'  (как текст для :'loser_id')
-- Для preview/realign рядом нужен \\set winner_id '…' — см. README.md
--
-- Источник SELECT: buildWebappLoserIntegratorUserIdGateUnionSql("psql") в
-- apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts (CI: тест совпадения с файлом).
--
-- Gate после realignment: все запросы должны вернуть 0.
`;

const DIAGNOSTICS_FILE_FOOTER = `
-- platform_users: канонические строки с этим integrator_user_id (после webapp merge loser обычно становится alias по UUID, integrator_user_id на canonical переносится политикой merge)
-- SELECT id, merged_into_id, integrator_user_id::text FROM platform_users WHERE integrator_user_id::text = :'loser_id' AND merged_into_id IS NULL;
`;

/** Full on-disk content for docs/.../diagnostics_webapp_integrator_user_id.sql (header + query + footer). */
export function fullDiagnosticsWebappIntegratorUserIdSqlFileContent(): string {
  const union = buildWebappLoserIntegratorUserIdGateUnionSql('psql');
  return `${DIAGNOSTICS_FILE_HEADER.trimEnd()}\n\n${union}\nORDER BY tbl;\n${DIAGNOSTICS_FILE_FOOTER.trimEnd()}\n`;
}

/** Resolved path to diagnostics SQL from repo root (for tests). */
export function diagnosticsWebappIntegratorUserIdSqlFilePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, '../../../../../');
  return join(
    repoRoot,
    'docs/archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/sql/diagnostics_webapp_integrator_user_id.sql',
  );
}

/** Read current diagnostics file (throws if missing). */
export function readDiagnosticsWebappIntegratorUserIdSqlFile(): string {
  return readFileSync(diagnosticsWebappIntegratorUserIdSqlFilePath(), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
}

/**
 * Validates integrator `users.id`-style decimal bigint strings for SQL binding.
 * Returns trimmed strings (no leading +, no scientific notation).
 */
export function parseMergePair(winnerRaw: string, loserRaw: string): MergePair {
  const winner = winnerRaw.trim();
  const loser = loserRaw.trim();
  if (!DECIMAL_INTEGRATOR_USER_ID.test(winner) || !DECIMAL_INTEGRATOR_USER_ID.test(loser)) {
    throw new Error(
      'winner and loser must be non-empty decimal digit strings (integrator users.id)',
    );
  }
  if (winner === loser) {
    throw new Error('winner and loser must differ');
  }
  return { winner, loser };
}
