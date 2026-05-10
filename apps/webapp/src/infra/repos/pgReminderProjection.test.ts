import { describe, expect, it } from "vitest";
import { inMemoryReminderProjectionPort } from "./inMemoryReminderProjection";

describe("ReminderProjectionPort (in-memory contract)", () => {
  it("upsert rule creates and updates idempotently", async () => {
    const port = inMemoryReminderProjectionPort;
    const params = {
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
      updatedAt: new Date().toISOString(),
    };
    await port.upsertRuleFromProjection(params);
    await port.upsertRuleFromProjection({ ...params, isEnabled: false });
    const rule = await port.getRuleByIntegratorUserIdAndCategory("42", "exercise");
    expect(rule).not.toBeNull();
    expect(rule!.id).toBe("rule-1");
    expect(rule!.userId).toBe("42");
    expect(rule!.isEnabled).toBe(false);
    const list = await port.listRulesByIntegratorUserId("42");
    expect(list.length).toBe(1);
    expect(list[0].category).toBe("exercise");
    expect(list[0].notificationTopicCode).toBeNull();
  });

  it("append finalized occurrence is idempotent", async () => {
    const port = inMemoryReminderProjectionPort;
    const params = {
      integratorOccurrenceId: "occ-1",
      integratorRuleId: "rule-1",
      integratorUserId: "42",
      category: "exercise",
      status: "sent" as const,
      deliveryChannel: "telegram",
      errorCode: null as string | null,
      occurredAt: new Date().toISOString(),
    };
    await port.appendFinalizedOccurrenceFromProjection(params);
    await port.appendFinalizedOccurrenceFromProjection(params);
    const history = await port.listHistoryByIntegratorUserId("42", 10);
    expect(history.filter((h) => h.id === "occ-1")).toHaveLength(1);
    expect(history[0].status).toBe("sent");
  });

  it("append delivery event is idempotent", async () => {
    const port = inMemoryReminderProjectionPort;
    const params = {
      integratorDeliveryLogId: "log-1",
      integratorOccurrenceId: "occ-1",
      integratorRuleId: "rule-1",
      integratorUserId: "42",
      channel: "telegram",
      status: "sent",
      errorCode: null as string | null,
      payloadJson: { msg: "ok" },
      createdAt: new Date().toISOString(),
    };
    await port.appendDeliveryEventFromProjection(params);
    await port.appendDeliveryEventFromProjection(params);
    // No duplicate key error; idempotent
  });

  it("upsert content access grant is idempotent", async () => {
    const port = inMemoryReminderProjectionPort;
    const params = {
      integratorGrantId: "grant-1",
      integratorUserId: "42",
      contentId: "content-1",
      purpose: "view",
      tokenHash: "abc",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      revokedAt: null as string | null,
      metaJson: {},
      createdAt: new Date().toISOString(),
    };
    await port.upsertContentAccessGrantFromProjection(params);
    await port.upsertContentAccessGrantFromProjection(params);
    // No error
  });

  it("list rules and get by category return correct sort and shape", async () => {
    const port = inMemoryReminderProjectionPort;
    await port.upsertRuleFromProjection({
      integratorRuleId: "r-a",
      integratorUserId: "100",
      category: "water",
      isEnabled: true,
      scheduleType: "daily",
      timezone: "UTC",
      intervalMinutes: 120,
      windowStartMinute: 0,
      windowEndMinute: 1440,
      daysMask: "1111111",
      contentMode: "none",
      updatedAt: new Date().toISOString(),
    });
    await port.upsertRuleFromProjection({
      integratorRuleId: "r-b",
      integratorUserId: "100",
      category: "exercise",
      isEnabled: false,
      scheduleType: "daily",
      timezone: "UTC",
      intervalMinutes: 60,
      windowStartMinute: 0,
      windowEndMinute: 1440,
      daysMask: "1111111",
      contentMode: "none",
      updatedAt: new Date().toISOString(),
    });
    const list = await port.listRulesByIntegratorUserId("100");
    expect(list.length).toBe(2);
    expect(list[0].category).toBe("exercise");
    expect(list[1].category).toBe("water");
    const byCat = await port.getRuleByIntegratorUserIdAndCategory("100", "water");
    expect(byCat?.id).toBe("r-a");
    expect(byCat?.category).toBe("water");
  });

  it("list history returns rows sorted by occurredAt DESC", async () => {
    const port = inMemoryReminderProjectionPort;
    const older = new Date(Date.now() - 10000).toISOString();
    const newer = new Date().toISOString();
    await port.appendFinalizedOccurrenceFromProjection({
      integratorOccurrenceId: "occ-old",
      integratorRuleId: "rule-1",
      integratorUserId: "99",
      category: "exercise",
      status: "sent",
      deliveryChannel: null,
      errorCode: null,
      occurredAt: older,
    });
    await port.appendFinalizedOccurrenceFromProjection({
      integratorOccurrenceId: "occ-new",
      integratorRuleId: "rule-1",
      integratorUserId: "99",
      category: "exercise",
      status: "failed",
      deliveryChannel: "telegram",
      errorCode: "timeout",
      occurredAt: newer,
    });
    const history = await port.listHistoryByIntegratorUserId("99", 5);
    expect(history.length).toBe(2);
    expect(history[0].id).toBe("occ-new");
    expect(history[1].id).toBe("occ-old");
  });
});
