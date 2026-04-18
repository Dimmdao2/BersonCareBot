import { describe, expect, it } from "vitest";
import { buildAppendEventInput, normalizeEventReason } from "./event-recording";

/** §8: `reason` обязателен для `stage_skipped` и `item_removed` — валидация в `normalizeEventReason` (AUDIT_PHASE_7 FIX). */
describe("event-recording (§8 reason)", () => {
  it("normalizeEventReason: stage_skipped rejects empty or whitespace", () => {
    expect(() => normalizeEventReason("stage_skipped", "")).toThrow(/причину/);
    expect(() => normalizeEventReason("stage_skipped", "   ")).toThrow(/причину/);
    expect(normalizeEventReason("stage_skipped", "Клинически")).toBe("Клинически");
  });

  it("normalizeEventReason: item_removed rejects missing or blank reason", () => {
    expect(() => normalizeEventReason("item_removed", undefined)).toThrow(/удаления/);
    expect(() => normalizeEventReason("item_removed", "")).toThrow(/удаления/);
    expect(normalizeEventReason("item_removed", "  Дубль  ")).toBe("Дубль");
  });

  it("normalizeEventReason: other event types allow absent reason", () => {
    expect(normalizeEventReason("comment_changed", undefined)).toBeNull();
    expect(normalizeEventReason("stage_completed", "optional")).toBe("optional");
  });

  it("buildAppendEventInput: enforces reason for stage_skipped", () => {
    expect(() =>
      buildAppendEventInput({
        instanceId: "00000000-0000-4000-8000-000000000001",
        actorId: null,
        eventType: "stage_skipped",
        targetType: "stage",
        targetId: "00000000-0000-4000-8000-000000000002",
        payload: { from: "available", to: "skipped" },
      }),
    ).toThrow(/причину/);
  });

  it("buildAppendEventInput: enforces reason for item_removed", () => {
    expect(() =>
      buildAppendEventInput({
        instanceId: "00000000-0000-4000-8000-000000000001",
        actorId: null,
        eventType: "item_removed",
        targetType: "stage_item",
        targetId: "00000000-0000-4000-8000-000000000002",
        payload: {},
      }),
    ).toThrow(/удаления/);
  });
});
