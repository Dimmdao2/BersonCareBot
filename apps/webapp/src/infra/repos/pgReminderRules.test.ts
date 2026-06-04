import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzleSqlFragmentToApproximateSql } from "@/infra/db/drizzleSqlDebugText";

const defaultRuleRow = vi.hoisted(() => ({
  integrator_rule_id: "r1",
  integrator_user_id: "99",
  category: "lfk",
  is_enabled: true,
  timezone: "Europe/Moscow",
  interval_minutes: 60,
  window_start_minute: 480,
  window_end_minute: 1200,
  days_mask: "1111100",
  schedule_type: "interval_window",
  schedule_data: null,
  reminder_intent: null,
  linked_object_type: null,
  linked_object_id: null,
  custom_title: null,
  custom_text: null,
  display_title: null,
  display_description: null,
  quiet_hours_start_minute: null,
  quiet_hours_end_minute: null,
  notification_topic_code: null,
  updated_at: "2025-01-01T00:00:00.000Z",
}));

const runWebappSqlMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    rows: [defaultRuleRow],
    rowCount: 1,
  }),
);
const rollbackMock = vi.hoisted(() => vi.fn());
const runWebappTransactionMock = vi.hoisted(() =>
  vi.fn(async (fn: (tx: { rollback: () => void }) => Promise<unknown>) => {
    const tx = { rollback: rollbackMock };
    return fn(tx);
  }),
);

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlDb: vi.fn(() => ({})),
  runWebappSql: runWebappSqlMock,
  runWebappTransaction: runWebappTransactionMock,
}));

import { createPgReminderRulesPort } from "./pgReminderRules";

function lastApproxSql(): string {
  const fragment = runWebappSqlMock.mock.calls.at(-1)?.[1];
  return drizzleSqlFragmentToApproximateSql(fragment);
}

describe("createPgReminderRulesPort", () => {
  beforeEach(() => {
    runWebappSqlMock.mockClear();
    rollbackMock.mockClear();
    runWebappTransactionMock.mockImplementation(async (fn) => {
      const tx = { rollback: rollbackMock };
      return fn(tx);
    });
    runWebappSqlMock.mockResolvedValue({ rows: [defaultRuleRow], rowCount: 1 });
  });

  it("listByPlatformUser joins reminder_rules with platform_users", async () => {
    const port = createPgReminderRulesPort();
    const rules = await port.listByPlatformUser("platform-uuid-1");
    expect(rules).toHaveLength(1);
    expect(rules[0].category).toBe("lfk");
    expect(rules[0].fallbackEnabled).toBe(true);
    const sql = lastApproxSql();
    expect(sql).toContain("FROM reminder_rules");
    expect(sql).toContain("platform_users");
  });

  it("getByPlatformUserAndCategory passes category filter", async () => {
    const port = createPgReminderRulesPort();
    await port.getByPlatformUserAndCategory("u1", "appointment");
    const sql = lastApproxSql();
    expect(sql).toContain("rr.category");
    expect(sql).toContain("appointment");
    expect(sql).toContain("u1");
  });

  it("retargetContentPageLinkedSlug updates content_page reminder linked_object_id", async () => {
    const port = createPgReminderRulesPort();
    runWebappSqlMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await port.retargetContentPageLinkedSlug(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "old-slug",
      "new-slug",
    );
    expect(runWebappSqlMock).toHaveBeenCalledTimes(1);
    const sql = lastApproxSql();
    expect(sql).toContain("UPDATE reminder_rules");
    expect(sql).toContain("content_pages");
    expect(sql).toContain("new-slug");
    expect(sql).toContain("old-slug");
    expect(sql).toContain("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("delete runs history delete then rule delete inside transaction", async () => {
    runWebappSqlMock
      .mockResolvedValueOnce({
        rows: [{ id: "rule-pk", integrator_rule_id: "int-rule-1" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const port = createPgReminderRulesPort();
    await expect(port.delete("int-rule-1", "platform-uuid-1")).resolves.toBe(true);
    expect(rollbackMock).not.toHaveBeenCalled();
    const historySql = drizzleSqlFragmentToApproximateSql(runWebappSqlMock.mock.calls[1]?.[1]);
    const ruleSql = drizzleSqlFragmentToApproximateSql(runWebappSqlMock.mock.calls[2]?.[1]);
    expect(historySql).toContain("reminder_occurrence_history");
    expect(ruleSql).toContain("DELETE FROM reminder_rules");
  });

  it("delete returns false and rolls back when rule is not owned", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const port = createPgReminderRulesPort();
    await expect(port.delete("missing", "platform-uuid-1")).resolves.toBe(false);
    expect(rollbackMock).toHaveBeenCalledTimes(1);
  });

  it("updateEnabled updates is_enabled by integrator_rule_id", async () => {
    const port = createPgReminderRulesPort();
    await port.updateEnabled("int-rule-2", false);
    const sql = lastApproxSql();
    expect(sql).toContain("is_enabled");
    expect(sql).toContain("int-rule-2");
  });
});
