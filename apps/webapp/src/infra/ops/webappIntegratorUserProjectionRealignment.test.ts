import { describe, expect, it } from "vitest";
import {
  buildWebappLoserIntegratorUserIdDiagnosticsSqlNodePg,
  buildWebappLoserIntegratorUserIdGateUnionSql,
  fullDiagnosticsWebappIntegratorUserIdSqlFileContent,
  parseMergePair,
  readDiagnosticsWebappIntegratorUserIdSqlFile,
  WEBAPP_INTEGRATOR_USER_ID_GATE_TABLE_SPECS,
  WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES,
} from "./webappIntegratorUserProjectionRealignment";

describe("parseMergePair", () => {
  it("accepts trimmed decimal ids", () => {
    expect(parseMergePair(" 10 ", "20")).toEqual({ winner: "10", loser: "20" });
  });

  it("rejects non-decimal and equal ids", () => {
    expect(() => parseMergePair("1a", "2")).toThrow(/decimal digit/);
    expect(() => parseMergePair("5", "5")).toThrow(/differ/);
  });
});

describe("WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES", () => {
  it("lists all projection tables from diagnostics_webapp_integrator_user_id.sql", () => {
    expect(WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES).toEqual([
      "user_subscriptions_webapp",
      "mailing_logs_webapp",
      "reminder_rules",
      "reminder_occurrence_history",
      "reminder_delivery_events",
      "content_access_grants_webapp",
      "support_conversations",
    ]);
  });

  it("matches gate table spec set (Stage 4 realignment scope)", () => {
    const gateSet = new Set(WEBAPP_INTEGRATOR_USER_ID_GATE_TABLE_SPECS.map((s) => s.table));
    const updateSet = new Set(WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES);
    expect(gateSet).toEqual(updateSet);
  });
});

describe("diagnostics_webapp_integrator_user_id.sql", () => {
  it("matches canonical builder (single source for gate UNION)", () => {
    expect(readDiagnosticsWebappIntegratorUserIdSqlFile()).toBe(
      fullDiagnosticsWebappIntegratorUserIdSqlFileContent(),
    );
  });
});

describe("buildWebappLoserIntegratorUserIdGateUnionSql", () => {
  it("nodePg union is wrapped consistently for pg client", () => {
    const inner = buildWebappLoserIntegratorUserIdGateUnionSql("nodePg");
    expect(buildWebappLoserIntegratorUserIdDiagnosticsSqlNodePg()).toBe(
      `SELECT tbl, cnt FROM (\n${inner}\n) q\nORDER BY tbl`,
    );
  });
});
