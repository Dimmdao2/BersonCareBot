import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const { runWebappPgTextMock, mockGetPool } = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(),
  mockGetPool: vi.fn(),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: mockGetPool,
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlFromPgClient: (client: unknown) => client,
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

import { pgChannelPreferencesPort } from "./pgChannelPreferences";

describe("pgChannelPreferencesPort (repo SQL parity)", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    mockGetPool.mockReset();
  });

  it("getPreferences uses canonical user match", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    await pgChannelPreferencesPort.getPreferences("550e8400-e29b-41d4-a716-446655440000");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("platform_user_id = $1::uuid");
    expect(sql).toContain("platform_user_id IS NULL AND user_id = $1::text");
  });

  it("upsertPreference runs INSERT then SELECT for channel", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            channel_code: "telegram",
            is_enabled_for_messages: false,
            is_enabled_for_notifications: true,
            is_preferred_for_auth: false,
          },
        ],
      });
    const pref = await pgChannelPreferencesPort.upsertPreference({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      channelCode: "telegram",
      isEnabledForMessages: false,
      isEnabledForNotifications: true,
    });
    expect(pref.channelCode).toBe("telegram");
    expect(pref.isEnabledForMessages).toBe(false);
    expect(runWebappPgTextMock.mock.calls.some((c) => String(c[0]).includes("INSERT INTO user_channel_preferences"))).toBe(
      true,
    );
  });

  it("getBroadcastNotificationFlagsBatch queries ANY uuid array", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const uid = "550e8400-e29b-41d4-a716-446655440000";
    await pgChannelPreferencesPort.getBroadcastNotificationFlagsBatch([uid]);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("platform_user_id = ANY($1::uuid[])");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([[uid]]);
  });

  it("setPreferredAuthChannel clears preferred with early COMMIT when channel is null", async () => {
    const transportQueries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        transportQueries.push(sql);
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    mockGetPool.mockReturnValue({ connect: vi.fn(async () => client) });
    runWebappPgTextMock.mockResolvedValue({ rows: [], rowCount: 1 });

    await pgChannelPreferencesPort.setPreferredAuthChannel(
      "550e8400-e29b-41d4-a716-446655440000",
      null,
    );

    expect(transportQueries).toEqual(["BEGIN", "COMMIT"]);
    expect(runWebappPgTextMock.mock.calls.some((c) => String(c[0]).includes("is_preferred_for_auth = false"))).toBe(
      true,
    );
    expect(runWebappPgTextMock.mock.calls.some((c) => String(c[0]).includes("INSERT INTO user_channel_preferences"))).toBe(
      false,
    );
  });

  it("setPreferredAuthChannel runs TX with domain SQL on client", async () => {
    const transportQueries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        transportQueries.push(sql);
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    mockGetPool.mockReturnValue({ connect: vi.fn(async () => client) });
    runWebappPgTextMock.mockResolvedValue({ rows: [], rowCount: 1 });

    await pgChannelPreferencesPort.setPreferredAuthChannel(
      "550e8400-e29b-41d4-a716-446655440000",
      "telegram",
    );

    expect(transportQueries[0]).toBe("BEGIN");
    expect(transportQueries).toContain("COMMIT");
    expect(runWebappPgTextMock.mock.calls.some((c) => String(c[0]).includes("is_preferred_for_auth = false"))).toBe(
      true,
    );
    expect(runWebappPgTextMock.mock.calls.some((c) => String(c[0]).includes("INSERT INTO user_channel_preferences"))).toBe(
      true,
    );
  });
});
