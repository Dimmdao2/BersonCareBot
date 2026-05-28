import { describe, expect, it } from "vitest";
import { computeIntegratorEventsRequestHash } from "./integratorEventSemanticHash";

describe("computeIntegratorEventsRequestHash", () => {
  it("ignores top-level occurredAt", () => {
    const a = computeIntegratorEventsRequestHash({
      eventType: "user.upserted",
      occurredAt: "2026-01-01T00:00:00.000Z",
      payload: { integratorUserId: "1" },
    });
    const b = computeIntegratorEventsRequestHash({
      eventType: "user.upserted",
      occurredAt: "2026-01-02T00:00:00.000Z",
      payload: { integratorUserId: "1" },
    });
    expect(a).toBe(b);
  });

  it("ignores payload.updatedAt for reminder.rule.upserted (matches integrator projection key)", () => {
    const basePayload = {
      integratorRuleId: "wp-rule-1",
      integratorUserId: "87",
      category: "exercise",
      isEnabled: true,
      scheduleType: "slots_v1",
      timezone: "Europe/Moscow",
      intervalMinutes: 60,
      windowStartMinute: 0,
      windowEndMinute: 1440,
      daysMask: "1111111",
      contentMode: "none",
    };
    const a = computeIntegratorEventsRequestHash({
      eventType: "reminder.rule.upserted",
      payload: { ...basePayload, updatedAt: "2026-05-28T10:00:00.000Z" },
    });
    const b = computeIntegratorEventsRequestHash({
      eventType: "reminder.rule.upserted",
      payload: { ...basePayload, updatedAt: "2026-05-28T12:04:00.181Z" },
    });
    expect(a).toBe(b);
  });

  it("still distinguishes different reminder.rule.upserted business fields", () => {
    const a = computeIntegratorEventsRequestHash({
      eventType: "reminder.rule.upserted",
      payload: {
        integratorRuleId: "wp-rule-1",
        intervalMinutes: 60,
        updatedAt: "2026-05-28T10:00:00.000Z",
      },
    });
    const b = computeIntegratorEventsRequestHash({
      eventType: "reminder.rule.upserted",
      payload: {
        integratorRuleId: "wp-rule-1",
        intervalMinutes: 30,
        updatedAt: "2026-05-28T10:00:00.000Z",
      },
    });
    expect(a).not.toBe(b);
  });
});
