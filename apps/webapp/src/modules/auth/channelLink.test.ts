import { afterEach, describe, expect, it, vi } from "vitest";
import { MergeConflictError } from "@/infra/repos/platformUserMergeErrors";

const queryMock = vi.fn();
const clientQueryMock = vi.fn();
const connectMock = vi.fn(async () => ({
  query: clientQueryMock,
  release: vi.fn(),
}));

const mergePlatformUsersInTransactionMock = vi.fn();

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({
    query: queryMock,
    connect: connectMock,
  }),
}));

vi.mock("@/infra/repos/pgPlatformUserMerge", () => ({
  mergePlatformUsersInTransaction: (...args: unknown[]) => mergePlatformUsersInTransactionMock(...args),
}));

vi.mock("@/infra/logging/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/config/env", () => ({
  env: { DATABASE_URL: "postgres://test-db" },
  integratorWebhookSecret: () => "test-integrator-webhook-secret",
}));

vi.mock("@/infra/repos/pgCanonicalPlatformUser", () => ({
  resolveCanonicalUserId: vi.fn(async (_pool: unknown, id: string) => id),
}));

import {
  completeChannelLinkFromIntegrator,
  setChannelLinkBindingConflictReporter,
  startChannelLink,
} from "./channelLink";

describe("completeChannelLinkFromIntegrator", () => {
  afterEach(() => {
    setChannelLinkBindingConflictReporter((ctx) => {
      console.warn("[channel_link:binding_conflict]", ctx);
    });
    queryMock.mockReset();
    clientQueryMock.mockReset();
    connectMock.mockClear();
    mergePlatformUsersInTransactionMock.mockReset();
  });

  it("returns conflict when external_id is bound to another user and stub is not eligible for auto-merge", async () => {
    const reporter = vi.fn();
    setChannelLinkBindingConflictReporter(reporter);
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "s1",
            user_id: "u1",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            used_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ user_id: "u2" }],
      })
      .mockResolvedValueOnce({
        rows: [{ phone_normalized: "+79990001133" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            phone_normalized: null,
            merged_into_id: null,
            oauth_count: "0",
          },
        ],
      });

    const res = await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(res).toMatchObject({ ok: false, code: "conflict" });
    expect(reporter).toHaveBeenCalledWith({
      channelCode: "telegram",
      externalId: "tg_1",
      tokenUserId: "u1",
      existingUserId: "u2",
    });
    expect(connectMock).not.toHaveBeenCalled();
    expect(mergePlatformUsersInTransactionMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  it("auto-merges oauth stub into TG owner and marks token used", async () => {
    setChannelLinkBindingConflictReporter(vi.fn());
    mergePlatformUsersInTransactionMock.mockResolvedValue({ targetId: "u2", duplicateId: "u1" });
    clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "s1",
            user_id: "u1",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            used_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ user_id: "u2" }],
      })
      .mockResolvedValueOnce({
        rows: [{ phone_normalized: "+79990001133" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            phone_normalized: null,
            merged_into_id: null,
            oauth_count: "1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ phone_normalized: "+79990001122" }],
      });

    const res = await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(res).toEqual({
      ok: true,
      userId: "u2",
      needsPhone: false,
      phoneNormalized: "+79990001122",
    });
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(mergePlatformUsersInTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      "u2",
      "u1",
      "phone_bind"
    );
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
  });

  it("returns conflict when auto-merge raises MergeConflictError", async () => {
    setChannelLinkBindingConflictReporter(vi.fn());
    mergePlatformUsersInTransactionMock.mockRejectedValue(
      new MergeConflictError("merge: blocked", ["u2", "u1"])
    );
    clientQueryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "s1",
            user_id: "u1",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            used_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ user_id: "u2" }],
      })
      .mockResolvedValueOnce({
        rows: [{ phone_normalized: "+79990001133" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            phone_normalized: null,
            merged_into_id: null,
            oauth_count: "1",
          },
        ],
      });

    const res = await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(res).toMatchObject({ ok: false, code: "conflict" });
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQueryMock).not.toHaveBeenCalledWith("COMMIT");
  });

  it("merges binding owner without phone into token user (full merge, not only binding row)", async () => {
    setChannelLinkBindingConflictReporter(vi.fn());
    mergePlatformUsersInTransactionMock.mockResolvedValueOnce({ targetId: "u1", duplicateId: "u2" });
    clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "s1",
            user_id: "u1",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            used_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ user_id: "u2" }],
      })
      .mockResolvedValueOnce({
        rows: [{ phone_normalized: null }],
      })
      .mockResolvedValueOnce({ rows: [{ phone_normalized: "+79990001122" }] });

    const res = await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "max",
      externalId: "207278131",
    });

    expect(res).toEqual({
      ok: true,
      userId: "u1",
      needsPhone: false,
      phoneNormalized: "+79990001122",
    });
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(mergePlatformUsersInTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "u2",
      "phone_bind",
    );
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
  });

  it("marks token used when binding already exists for same user", async () => {
    queryMock.mockReset();
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "s1",
            user_id: "u1",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            used_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ user_id: "u1" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ phone_normalized: "+79990001122" }] });

    const res = await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(res).toEqual({
      ok: true,
      userId: "u1",
      needsPhone: false,
      phoneNormalized: "+79990001122",
    });
    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  it("rejects expired token", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "s1",
          user_id: "u1",
          expires_at: new Date(Date.now() - 60_000).toISOString(),
          used_at: null,
        },
      ],
    });

    const res = await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(res).toEqual({ ok: false, code: "unknown_or_expired" });
  });

  it("rejects already used token", async () => {
    queryMock.mockReset();
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "s1",
            user_id: "u1",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            used_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ phone_normalized: null }] });

    const res = await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(res).toEqual({ ok: false, code: "used_token", needsPhone: true });
  });
});

describe("startChannelLink", () => {
  it("creates max link challenge and returns manual command when nick missing", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });

    const result = await startChannelLink({
      userId: "u-max-1",
      channelCode: "max",
      botUsername: "bersoncare_bot",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBe("https://max.ru/");
      expect(result.manualCommand).toMatch(/^\/start link_[A-Za-z0-9_-]+$/);
      expect(result.expiresAtIso).toBeTruthy();
    }
    expect(queryMock).toHaveBeenCalled();
  });

  it("creates max deep link when maxBotNickname is set", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });

    const result = await startChannelLink({
      userId: "u-max-1",
      channelCode: "max",
      botUsername: "bersoncare_bot",
      maxBotNickname: "https://max.ru/CareMaxBot",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toMatch(/^https:\/\/max\.ru\/CareMaxBot\?start=link_[A-Za-z0-9_-]+$/);
      expect(result.manualCommand).toMatch(/^\/start link_[A-Za-z0-9_-]+$/);
    }
  });
});
