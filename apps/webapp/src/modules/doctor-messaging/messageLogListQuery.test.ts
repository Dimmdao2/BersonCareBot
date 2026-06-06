import { describe, expect, it } from "vitest";
import { normalizeMessageLogListParams } from "./messageLogListQuery";

describe("messageLogListQuery", () => {
  it("clamps pageSize to 100 and drops invalid userId", () => {
    const normalized = normalizeMessageLogListParams({
      page: 0,
      pageSize: 500,
      filters: { userId: "not-a-uuid", category: "reminder" },
    });
    expect(normalized.page).toBe(1);
    expect(normalized.pageSize).toBe(100);
    expect(normalized.filters).toEqual({ category: "reminder" });
  });

  it("keeps valid uuid filter", () => {
    const uid = "550e8400-e29b-41d4-a716-446655440000";
    const normalized = normalizeMessageLogListParams({
      filters: { userId: uid },
    });
    expect(normalized.filters.userId).toBe(uid);
  });

  it("drops all filters when dateFrom fails Zod datetime", () => {
    const normalized = normalizeMessageLogListParams({
      filters: { category: "reminder", dateFrom: "2026-01-01" },
    });
    expect(normalized.filters).toEqual({});
  });
});
