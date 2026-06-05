/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const clientQueryMock = vi.hoisted(() => vi.fn());
const resolveCanonicalUserIdMock = vi.hoisted(() => vi.fn());
const mergePlatformUsersInTransactionMock = vi.hoisted(() => vi.fn());
const pickMergeTargetIdMock = vi.hoisted(() => vi.fn());
const enrichPickMergeCandidatesWithBookingCountsMock = vi.hoisted(() => vi.fn());

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
  resolveCanonicalUserId: (...args: unknown[]) => resolveCanonicalUserIdMock(...args),
  findCanonicalUserIdByPhone: vi.fn(),
}));

vi.mock("@/infra/repos/pgPhoneHistory", () => ({
  applyPlatformUserPhoneHistoryTransition: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/infra/upsertBroadcastDefaultsAfterChannelBind", () => ({
  upsertBroadcastDefaultsAfterChannelBind: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/infra/repos/pgPlatformUserMerge", () => ({
  mergePlatformUsersInTransaction: (...args: unknown[]) => mergePlatformUsersInTransactionMock(...args),
  pickMergeTargetId: (...args: unknown[]) => pickMergeTargetIdMock(...args),
  enrichPickMergeCandidatesWithBookingCounts: (...args: unknown[]) =>
    enrichPickMergeCandidatesWithBookingCountsMock(...args),
}));

import { pgUserByPhonePort } from "./pgUserByPhone";

const phone = "+79991234567";
const telegramCtx = { channel: "telegram" as const, chatId: "tg-100", displayName: "Pat" };

function mockSessionUserLoad(userId: string) {
  runWebappPgTextMock
    .mockResolvedValueOnce({
      rows: [{ id: userId, display_name: "Pat", first_name: null, role: "client", phone_normalized: phone }],
    })
    .mockResolvedValueOnce({ rows: [{ channel_code: "telegram", external_id: "tg-100" }] });
}

describe("pgUserByPhonePort.createOrBind", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCanonicalUserIdMock.mockImplementation(async (_db: unknown, id: string) => id);
    clientQueryMock.mockImplementation((sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK" || sql.startsWith("SET CONSTRAINTS")) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  it("links existing channel binding: BEGIN → domain updates → early COMMIT (no ROLLBACK)", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ user_id: "bound-user" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mockSessionUserLoad("bound-user");

    const result = await pgUserByPhonePort.createOrBind(phone, telegramCtx);

    expect(result.wasCreated).toBe(false);
    expect(result.user.userId).toBe("bound-user");
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(clientQueryMock).not.toHaveBeenCalledWith("ROLLBACK");
    expect(runWebappPgTextMock.mock.calls[0]?.[0]).toContain("user_channel_bindings");
  });

  it("creates new user when no binding and no phone row", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "new-user", display_name: "Pat" }] })
      .mockResolvedValueOnce({ rows: [{ user_id: "new-user" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    mockSessionUserLoad("new-user");

    const result = await pgUserByPhonePort.createOrBind(phone, telegramCtx);

    expect(result.wasCreated).toBe(true);
    expect(result.user.userId).toBe("new-user");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(clientQueryMock).not.toHaveBeenCalledWith("ROLLBACK");
  });

  it("rolls back when domain SQL fails before COMMIT", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("phone_lookup_failed"));

    await expect(pgUserByPhonePort.createOrBind(phone, telegramCtx)).rejects.toThrow("phone_lookup_failed");

    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQueryMock).not.toHaveBeenCalledWith("COMMIT");
  });

  it("merges duplicate owners when binding insert conflicts", async () => {
    const mergeRow = {
      id: "user-a",
      phone_normalized: phone,
      integrator_user_id: null,
      merged_into_id: null,
      display_name: "A",
      first_name: null,
      last_name: null,
      email: null,
      created_at: new Date(),
    };
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "user-a", display_name: "A", role: "client" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ user_id: "user-b" }] })
      .mockResolvedValueOnce({ rows: [mergeRow] })
      .mockResolvedValueOnce({ rows: [{ ...mergeRow, id: "user-b" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    enrichPickMergeCandidatesWithBookingCountsMock.mockResolvedValueOnce([mergeRow, { ...mergeRow, id: "user-b" }]);
    pickMergeTargetIdMock.mockReturnValueOnce({ target: "user-a", duplicate: "user-b" });
    mergePlatformUsersInTransactionMock.mockResolvedValueOnce({ targetId: "user-a", duplicateId: "user-b" });
    mockSessionUserLoad("user-a");

    const result = await pgUserByPhonePort.createOrBind(phone, telegramCtx);

    expect(result.wasCreated).toBe(false);
    expect(mergePlatformUsersInTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      "user-a",
      "user-b",
      "phone_bind",
    );
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
  });

  it("rejects invalid channel context at Zod boundary", async () => {
    await expect(
      pgUserByPhonePort.createOrBind(phone, { channel: "telegram", chatId: "  ", displayName: "x" }),
    ).rejects.toThrow(/channel_context: invalid row shape/);
  });
});
