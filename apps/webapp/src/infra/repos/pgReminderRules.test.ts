import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
        rows: [
      {
        integrator_rule_id: "r1",
        integrator_user_id: "99",
        category: "lfk",
        is_enabled: true,
        interval_minutes: 60,
        window_start_minute: 480,
        window_end_minute: 1200,
        days_mask: "1111100",
        linked_object_type: null,
        linked_object_id: null,
        custom_title: null,
        custom_text: null,
        updated_at: "2025-01-01T00:00:00.000Z",
      },
    ],
  }),
);
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock })));

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { createPgReminderRulesPort } from "./pgReminderRules";

describe("createPgReminderRulesPort", () => {
  beforeEach(() => {
    queryMock.mockClear();
  });

  it("listByPlatformUser joins reminder_rules with platform_users", async () => {
    const port = createPgReminderRulesPort();
    const rules = await port.listByPlatformUser("platform-uuid-1");
    expect(rules).toHaveLength(1);
    expect(rules[0].category).toBe("lfk");
    expect(rules[0].fallbackEnabled).toBe(true);
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("FROM reminder_rules");
    expect(sql).toContain("platform_users");
  });

  it("getByPlatformUserAndCategory passes category filter", async () => {
    const port = createPgReminderRulesPort();
    await port.getByPlatformUserAndCategory("u1", "appointment");
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("AND rr.category = $2");
    expect(queryMock.mock.calls[0]?.[1]).toEqual(["u1", "appointment"]);
  });

  it("retargetContentPageLinkedSlug updates content_page reminder linked_object_id", async () => {
    const port = createPgReminderRulesPort();
    await port.retargetContentPageLinkedSlug("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "old-slug", "new-slug");
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] ?? [];
    expect(String(sql)).toContain("UPDATE reminder_rules");
    expect(String(sql)).toContain("content_pages");
    expect(params).toEqual(["new-slug", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "old-slug"]);
  });
});
