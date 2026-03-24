import { describe, expect, it } from "vitest";
import { dayKeyFromIso, formatChatDayLabelRu, groupMessagesByDay } from "./messageFormatting";

describe("messageFormatting", () => {
  it("dayKeyFromIso groups UTC day", () => {
    expect(dayKeyFromIso("2025-03-15T22:00:00.000Z")).toBe("2025-03-15");
  });

  it("formatChatDayLabelRu returns non-empty for valid iso", () => {
    const s = formatChatDayLabelRu("2025-03-15T12:00:00.000Z");
    expect(s.length).toBeGreaterThan(3);
  });

  it("groupMessagesByDay merges same day", () => {
    const g = groupMessagesByDay([
      { id: "a", createdAt: "2025-03-15T10:00:00.000Z" },
      { id: "b", createdAt: "2025-03-15T18:00:00.000Z" },
      { id: "c", createdAt: "2025-03-16T08:00:00.000Z" },
    ]);
    expect(g).toHaveLength(2);
    expect(g[0]!.items).toHaveLength(2);
    expect(g[1]!.items).toHaveLength(1);
  });
});
