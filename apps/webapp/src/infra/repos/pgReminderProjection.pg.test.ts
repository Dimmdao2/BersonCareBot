import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzleSqlFragmentToApproximateSql } from "@/infra/db/drizzleSqlDebugText";

const runWebappSqlMock = vi.hoisted(() => vi.fn());
const findCanonicalMock = vi.hoisted(() => vi.fn());
const loadWarmupsMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const getPoolMock = vi.hoisted(() => vi.fn(() => ({})));

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

vi.mock("@/infra/repos/pgCanonicalPlatformUser", () => ({
  findCanonicalUserIdByIntegratorId: findCanonicalMock,
}));

vi.mock("@/modules/reminders/loadWarmupsSectionSlugs", () => ({
  loadWarmupsSectionSlugs: loadWarmupsMock,
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlDb: vi.fn(() => ({})),
  runWebappSql: runWebappSqlMock,
}));

import { createPgReminderProjectionPort } from "./pgReminderProjection";

function lastApproxSql(): string {
  const fragment = runWebappSqlMock.mock.calls.at(-1)?.[1];
  return drizzleSqlFragmentToApproximateSql(fragment);
}

describe("createPgReminderProjectionPort (pg SQL)", () => {
  beforeEach(() => {
    runWebappSqlMock.mockClear();
    findCanonicalMock.mockClear();
    loadWarmupsMock.mockClear();
    runWebappSqlMock.mockResolvedValue({ rows: [], rowCount: 0 });
    findCanonicalMock.mockResolvedValue("platform-uuid-canonical");
  });

  it("upsertRuleFromProjection resolves platform_user_id via canonical lookup (integrator_user_id preserved)", async () => {
    const port = createPgReminderProjectionPort();
    await port.upsertRuleFromProjection({
      integratorRuleId: "rule-1",
      integratorUserId: "42",
      category: "exercise",
      isEnabled: true,
      scheduleType: "daily",
      timezone: "Europe/Moscow",
      intervalMinutes: 60,
      windowStartMinute: 0,
      windowEndMinute: 1440,
      daysMask: "1111111",
      contentMode: "none",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(findCanonicalMock).toHaveBeenCalledWith(expect.anything(), "42");
    const sql = lastApproxSql();
    expect(sql).toContain("INSERT INTO reminder_rules");
    expect(sql).toContain("integrator_user_id");
    expect(sql).toContain("ON CONFLICT (integrator_rule_id)");
    expect(sql).toContain("platform-uuid-canonical");
  });

  it("upsertRuleFromProjection skips canonical lookup when integratorUserId is empty", async () => {
    const port = createPgReminderProjectionPort();
    await port.upsertRuleFromProjection({
      integratorRuleId: "rule-empty",
      integratorUserId: "",
      category: "exercise",
      isEnabled: true,
      scheduleType: "daily",
      timezone: "Europe/Moscow",
      intervalMinutes: 60,
      windowStartMinute: 0,
      windowEndMinute: 1440,
      daysMask: "1111111",
      contentMode: "none",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(findCanonicalMock).not.toHaveBeenCalled();
  });

  it("appendFinalizedOccurrenceFromProjection uses ON CONFLICT DO NOTHING (idempotent)", async () => {
    const port = createPgReminderProjectionPort();
    await port.appendFinalizedOccurrenceFromProjection({
      integratorOccurrenceId: "occ-1",
      integratorRuleId: "rule-1",
      integratorUserId: "99",
      category: "lfk",
      status: "sent",
      deliveryChannel: null,
      errorCode: null,
      occurredAt: "2026-01-01T12:00:00.000Z",
    });
    const sql = lastApproxSql();
    expect(sql).toContain("reminder_occurrence_history");
    expect(sql).toContain("ON CONFLICT (integrator_occurrence_id) DO NOTHING");
  });

  it("appendDeliveryEventFromProjection uses ON CONFLICT on integrator_delivery_log_id", async () => {
    const port = createPgReminderProjectionPort();
    await port.appendDeliveryEventFromProjection({
      integratorDeliveryLogId: "del-1",
      integratorOccurrenceId: "occ-1",
      integratorRuleId: "rule-1",
      integratorUserId: "99",
      channel: "telegram",
      status: "sent",
      errorCode: null,
      payloadJson: {},
      createdAt: "2026-01-01T12:00:00.000Z",
    });
    const sql = lastApproxSql();
    expect(sql).toContain("reminder_delivery_events");
    expect(sql).toContain("ON CONFLICT (integrator_delivery_log_id) DO NOTHING");
  });

  it("listHistoryByIntegratorUserId filters by integrator_user_id (no canonical rewrite)", async () => {
    runWebappSqlMock.mockResolvedValueOnce({
      rows: [
        {
          integrator_occurrence_id: "occ-a",
          integrator_rule_id: "rule-a",
          status: "sent",
          delivery_channel: null,
          error_code: null,
          occurred_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      rowCount: 1,
    });
    const port = createPgReminderProjectionPort();
    const list = await port.listHistoryByIntegratorUserId("77", 10);
    expect(list).toHaveLength(1);
    expect(findCanonicalMock).not.toHaveBeenCalled();
    const sql = lastApproxSql();
    expect(sql).toContain("integrator_user_id");
    expect(sql).toContain("77");
  });

  it("markSeen passes occurrence id array to UPDATE", async () => {
    const port = createPgReminderProjectionPort();
    await port.markSeen("platform-u", ["occ-1", "occ-2"]);
    const sql = lastApproxSql();
    expect(sql).toContain("seen_at");
    expect(sql).toContain("ANY");
    expect(sql).toContain("platform-u");
  });
});
