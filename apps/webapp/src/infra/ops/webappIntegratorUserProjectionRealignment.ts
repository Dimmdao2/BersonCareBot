/**
 * Stage 4 webapp: realign projection rows from loser integrator_user_id → winner.
 * Used by `scripts/realign-webapp-integrator-user-projection.ts` and documented in
 * `docs/PLATFORM_USER_MERGE_V2/sql/realign_webapp_integrator_user_id.sql`.
 *
 * Gate UNION (`diagnostics_webapp_integrator_user_id.sql` + dry-run job) строится из
 * `WEBAPP_INTEGRATOR_USER_ID_GATE_TABLE_SPECS` — единственный источник списка таблиц и WHERE.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DECIMAL_INTEGRATOR_USER_ID = /^\d+$/;

export type MergePair = { winner: string; loser: string };

export type WebappLoserGateParamMode = "psql" | "nodePg";

function loserIdParamToken(mode: WebappLoserGateParamMode): string {
  return mode === "psql" ? ":'loser_id'" : "$1";
}

/** Specs for gate: loser integrator_user_id counts (same tables as realignment UPDATE targets). */
export const WEBAPP_INTEGRATOR_USER_ID_GATE_TABLE_SPECS = [
  { table: "reminder_rules", whereClause: (p: string) => `integrator_user_id::text = ${p}` },
  { table: "reminder_occurrence_history", whereClause: (p: string) => `integrator_user_id::text = ${p}` },
  { table: "reminder_delivery_events", whereClause: (p: string) => `integrator_user_id::text = ${p}` },
  { table: "content_access_grants_webapp", whereClause: (p: string) => `integrator_user_id::text = ${p}` },
  {
    table: "support_conversations",
    whereClause: (p: string) => `integrator_user_id IS NOT NULL AND integrator_user_id::text = ${p}`,
  },
  { table: "user_subscriptions_webapp", whereClause: (p: string) => `integrator_user_id::text = ${p}` },
  { table: "mailing_logs_webapp", whereClause: (p: string) => `integrator_user_id::text = ${p}` },
] as const;

/** Tables touched by rekey UPDATE (after subscription/mailing dedup DELETEs). Order matches job script. */
export const WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES = [
  "user_subscriptions_webapp",
  "mailing_logs_webapp",
  "reminder_rules",
  "reminder_occurrence_history",
  "reminder_delivery_events",
  "content_access_grants_webapp",
  "support_conversations",
] as const;

/**
 * UNION ALL branches for gate diagnostics (no outer wrapper).
 * psql: use in `diagnostics_webapp_integrator_user_id.sql` via `fullDiagnosticsWebappIntegratorUserIdSqlFileBody()`.
 * nodePg: one placeholder `$1` for loser id (text form).
 */
export function buildWebappLoserIntegratorUserIdGateUnionSql(mode: WebappLoserGateParamMode): string {
  const p = loserIdParamToken(mode);
  return WEBAPP_INTEGRATOR_USER_ID_GATE_TABLE_SPECS.map(
    (spec) =>
      `SELECT '${spec.table}' AS tbl, COUNT(*)::bigint AS cnt\nFROM ${spec.table} WHERE ${spec.whereClause(p)}`,
  ).join("\nUNION ALL\n");
}

/** Wrapped query for `pg` client (ordered result). */
export function buildWebappLoserIntegratorUserIdDiagnosticsSqlNodePg(): string {
  const inner = buildWebappLoserIntegratorUserIdGateUnionSql("nodePg");
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
  const union = buildWebappLoserIntegratorUserIdGateUnionSql("psql");
  return `${DIAGNOSTICS_FILE_HEADER.trimEnd()}\n\n${union}\nORDER BY tbl;\n${DIAGNOSTICS_FILE_FOOTER.trimEnd()}\n`;
}

/** Resolved path to diagnostics SQL from repo root (for tests). */
export function diagnosticsWebappIntegratorUserIdSqlFilePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "../../../../../");
  return join(repoRoot, "docs/PLATFORM_USER_MERGE_V2/sql/diagnostics_webapp_integrator_user_id.sql");
}

/** Read current diagnostics file (throws if missing). */
export function readDiagnosticsWebappIntegratorUserIdSqlFile(): string {
  return readFileSync(diagnosticsWebappIntegratorUserIdSqlFilePath(), "utf8").replace(/\r\n/g, "\n");
}

/**
 * Validates integrator `users.id`-style decimal bigint strings for SQL binding.
 * Returns trimmed strings (no leading +, no scientific notation).
 */
export function parseMergePair(winnerRaw: string, loserRaw: string): MergePair {
  const winner = winnerRaw.trim();
  const loser = loserRaw.trim();
  if (!DECIMAL_INTEGRATOR_USER_ID.test(winner) || !DECIMAL_INTEGRATOR_USER_ID.test(loser)) {
    throw new Error("winner and loser must be non-empty decimal digit strings (integrator users.id)");
  }
  if (winner === loser) {
    throw new Error("winner and loser must differ");
  }
  return { winner, loser };
}
