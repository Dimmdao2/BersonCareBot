import { afterEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({ query: queryMock }),
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
  });

  it("returns conflict when external_id is bound to another user", async () => {
    const reporter = vi.fn();
    setChannelLinkBindingConflictReporter(reporter);
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
        rows: [{ user_id: "u2" }],
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
    expect(queryMock).toHaveBeenCalledTimes(2);
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
  it("creates max link challenge and returns manual command", async () => {
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
});
