/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const clientQueryMock = vi.hoisted(() => vi.fn());
const mergeCanonicalPlatformUserCandidatesMock = vi.hoisted(() => vi.fn());
const findTrustedCanonicalUserIdByPhoneMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({
    connect: async () => ({
      query: clientQueryMock,
      release: vi.fn(),
    }),
  }),
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  runPgPoolPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  getWebappSqlFromPgClient: (client: unknown) => client,
}));

vi.mock("@/infra/repos/pgCanonicalPlatformUser", () => ({
  resolveCanonicalUserId: vi.fn(async () => null),
  findCanonicalUserIdByIntegratorId: vi.fn(),
  findTrustedCanonicalUserIdByPhone: (...args: unknown[]) => findTrustedCanonicalUserIdByPhoneMock(...args),
}));

vi.mock("@/infra/repos/pgUserProjection", () => ({
  mergeCanonicalPlatformUserCandidates: (...args: unknown[]) => mergeCanonicalPlatformUserCandidatesMock(...args),
}));

vi.mock("@/infra/upsertBroadcastDefaultsAfterChannelBind", () => ({
  upsertBroadcastDefaultsAfterChannelBind: vi.fn().mockResolvedValue(undefined),
}));

import { pgIdentityResolutionPort } from "./pgIdentityResolution";

describe("pgIdentityResolutionPort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientQueryMock.mockImplementation((sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  it("findByChannelBinding returns null when binding is absent", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const user = await pgIdentityResolutionPort.findByChannelBinding({
      channelCode: "telegram",
      externalId: "tg-404",
    });
    expect(user).toBeNull();
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
  });

  it("findOrCreateByChannelBinding links existing binding", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ user_id: "user-existing" }] })
      .mockResolvedValueOnce({
        rows: [{ display_name: "Pat", role: "client", phone_normalized: "+79990000000" }],
      })
      .mockResolvedValueOnce({ rows: [{ channel_code: "telegram", external_id: "tg-1" }] });

    const result = await pgIdentityResolutionPort.findOrCreateByChannelBinding({
      channelCode: "telegram",
      externalId: "tg-1",
      displayName: "Pat",
    });

    expect(result.accountOutcome).toBe("linked_existing");
    expect(result.user.userId).toBe("user-existing");
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
  });

  it("findOrCreateByChannelBinding inserts new platform user when no hints", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "new-user" }] })
      .mockResolvedValueOnce({ rows: [{ user_id: "new-user" }] })
      .mockResolvedValueOnce({
        rows: [{ display_name: "tg-new", role: "client", phone_normalized: null }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await pgIdentityResolutionPort.findOrCreateByChannelBinding({
      channelCode: "max",
      externalId: "max-new",
      displayName: "New User",
    });

    expect(result.accountOutcome).toBe("created");
    expect(result.user.userId).toBe("new-user");
    expect(mergeCanonicalPlatformUserCandidatesMock).not.toHaveBeenCalled();
  });

  it("findOrCreateByChannelBinding merges hint candidates before bind", async () => {
    findTrustedCanonicalUserIdByPhoneMock.mockResolvedValueOnce("hint-user");
    mergeCanonicalPlatformUserCandidatesMock.mockResolvedValueOnce("merged-user");
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: "merged-user" }] })
      .mockResolvedValueOnce({
        rows: [{ display_name: "M", role: "client", phone_normalized: "+79991111111" }],
      })
      .mockResolvedValueOnce({ rows: [{ channel_code: "telegram", external_id: "tg-hint" }] });

    const result = await pgIdentityResolutionPort.findOrCreateByChannelBinding({
      channelCode: "telegram",
      externalId: "tg-hint",
      resolutionHints: { phoneNormalized: "+79991111111" },
    });

    expect(mergeCanonicalPlatformUserCandidatesMock).toHaveBeenCalled();
    expect(result.accountOutcome).toBe("linked_existing");
    expect(result.user.userId).toBe("merged-user");
  });

  it("findOrCreateByChannelBinding rolls back when insert fails", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("insert_failed"));

    await expect(
      pgIdentityResolutionPort.findOrCreateByChannelBinding({
        channelCode: "vk",
        externalId: "vk-1",
      }),
    ).rejects.toThrow("insert_failed");

    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQueryMock).not.toHaveBeenCalledWith("COMMIT");
  });

  it("rejects invalid channel code at Zod boundary", async () => {
    await expect(
      pgIdentityResolutionPort.findByChannelBinding({
        channelCode: "web" as "telegram",
        externalId: "x",
      }),
    ).rejects.toThrow(/channel_binding_lookup: invalid row shape/);
  });
});
