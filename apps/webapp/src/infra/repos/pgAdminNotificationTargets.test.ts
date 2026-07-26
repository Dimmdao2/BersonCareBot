import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { loadAdminNotificationTargetsFromDb } from "./pgAdminNotificationTargets";

describe("loadAdminNotificationTargetsFromDb (C-4, 2026-07-26)", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("queries role='admin' joined to channel bindings, not any admin_* setting list", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
    await loadAdminNotificationTargetsFromDb();
    const [queryText] = runWebappPgTextMock.mock.calls[0]!;
    expect(queryText).toContain("role = 'admin'");
    expect(queryText).toContain("platform_users");
    expect(queryText).toContain("user_channel_bindings");
    expect(queryText).toContain("merged_into_id IS NULL");
    expect(queryText).toContain("is_archived = FALSE");
  });

  it("splits telegram/max by channel_code and collects phone separately, deduping", async () => {
    runWebappPgTextMock.mockResolvedValue({
      rows: [
        { phone_normalized: "+79990001122", channel_code: "telegram", external_id: "111" },
        { phone_normalized: "+79990001122", channel_code: "max", external_id: "222" },
        // Second admin, telegram only, no phone.
        { phone_normalized: null, channel_code: "telegram", external_id: "333" },
        // Duplicate telegram id must not appear twice.
        { phone_normalized: "+79990001122", channel_code: "telegram", external_id: "111" },
      ],
    });

    const result = await loadAdminNotificationTargetsFromDb();

    expect(result.telegram.sort()).toEqual(["111", "333"]);
    expect(result.max).toEqual(["222"]);
    expect(result.sms).toEqual(["+79990001122"]);
  });

  it("returns empty lists when nobody currently holds the admin role", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
    const result = await loadAdminNotificationTargetsFromDb();
    expect(result).toEqual({ telegram: [], max: [], sms: [] });
  });

  it("ignores a row with no bound channel and no phone (admin with nothing bound)", async () => {
    runWebappPgTextMock.mockResolvedValue({
      rows: [{ phone_normalized: null, channel_code: null, external_id: null }],
    });
    const result = await loadAdminNotificationTargetsFromDb();
    expect(result).toEqual({ telegram: [], max: [], sms: [] });
  });
});
