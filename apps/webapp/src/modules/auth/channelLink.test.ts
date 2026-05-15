import { afterEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const clientQueryMock = vi.fn();
const connectMock = vi.fn(async () => ({
  query: clientQueryMock,
  release: vi.fn(),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({
    query: queryMock,
    connect: connectMock,
  }),
}));

vi.mock("@/infra/adminAuditLog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/adminAuditLog")>();
  return {
    ...actual,
    upsertOpenConflictLog: vi.fn().mockResolvedValue({ kind: "conflict", insertedFirst: true }),
  };
});

const { sendAdminIncidentRelayAlertMock } = vi.hoisted(() => ({
  sendAdminIncidentRelayAlertMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/admin-incidents/sendAdminIncidentAlerts", async () => {
  const { computeChannelLinkOwnershipConflictKey } = await import("@/infra/adminAuditLog");
  return {
    notifyChannelLinkBindingConflict: vi.fn().mockResolvedValue(undefined),
    sendAdminIncidentRelayAlert: sendAdminIncidentRelayAlertMock,
    notifyChannelLinkOwnershipConflictRelay: async (
      upsertResult: import("@/infra/adminAuditLog").UpsertOpenConflictLogResult,
      ctx: import("@/modules/admin-incidents/sendAdminIncidentAlerts").ChannelLinkBindingConflictCtx & {
        classifiedReason: string;
      },
    ) => {
      if (upsertResult.kind !== "conflict" || !upsertResult.insertedFirst) return;
      const dk = computeChannelLinkOwnershipConflictKey(
        ctx.channelCode,
        ctx.externalId,
        ctx.tokenUserId,
        ctx.existingUserId,
      );
      await sendAdminIncidentRelayAlertMock({
        topic: "channel_link",
        dedupKey: dk,
        lines: [
          "channel_link ownership conflict",
          `channel=${ctx.channelCode}`,
          `externalId=${ctx.externalId}`,
          `tokenUserId=${ctx.tokenUserId}`,
          `existingUserId=${ctx.existingUserId}`,
          `classifiedReason=${ctx.classifiedReason}`,
        ],
      });
    },
  };
});

vi.mock("./channelLinkClaim", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./channelLinkClaim")>();
  return {
    ...actual,
    classifyChannelBindingOwnerForLink: vi.fn(),
    claimMessengerChannelBindingInTransaction: vi.fn(),
  };
});

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

import { upsertOpenConflictLog } from "@/infra/adminAuditLog";
import * as channelLinkClaim from "./channelLinkClaim";
import { ChannelLinkClaimRejectedError } from "./channelLinkClaim";
import {
  completeChannelLinkFromIntegrator,
  setChannelLinkBindingConflictReporter,
  startChannelLink,
} from "./channelLink";

const classifyMock = vi.mocked(channelLinkClaim.classifyChannelBindingOwnerForLink);
const claimMock = vi.mocked(channelLinkClaim.claimMessengerChannelBindingInTransaction);
const upsertMock = vi.mocked(upsertOpenConflictLog);

function freshSecretRow(overrides: Partial<{ id: string; user_id: string }> = {}) {
  return {
    id: "s1",
    user_id: "u1",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used_at: null,
    ...overrides,
  };
}

describe("completeChannelLinkFromIntegrator", () => {
  afterEach(() => {
    setChannelLinkBindingConflictReporter((ctx) => {
      console.warn("[channel_link:binding_conflict]", ctx);
    });
    queryMock.mockReset();
    clientQueryMock.mockReset();
    connectMock.mockClear();
    classifyMock.mockReset();
    claimMock.mockReset();
    upsertMock.mockReset();
    sendAdminIncidentRelayAlertMock.mockClear();
    upsertMock.mockResolvedValue({ kind: "conflict", insertedFirst: true });
  });

  it("returns conflict for real stub: audit + ownership relay on first insert; no claim tx", async () => {
    const reporter = vi.fn();
    setChannelLinkBindingConflictReporter(reporter);
    classifyMock.mockResolvedValueOnce({ kind: "real", reason: "stub_has_phone" });

    queryMock
      .mockResolvedValueOnce({ rows: [freshSecretRow()] })
      .mockResolvedValueOnce({ rows: [{ user_id: "u2" }] });

    const res = await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(res).toMatchObject({ ok: false, code: "conflict", mergeReason: "channel_owned_by_real_user" });
    expect(reporter).toHaveBeenCalledWith({
      channelCode: "telegram",
      externalId: "tg_1",
      tokenUserId: "u1",
      existingUserId: "u2",
    });
    expect(connectMock).not.toHaveBeenCalled();
    expect(claimMock).not.toHaveBeenCalled();
    expect(upsertMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "channel_link_ownership_conflict",
        conflictKey: expect.any(String),
        candidateIds: ["u1", "u2"],
        targetId: "u1",
        details: expect.objectContaining({
          classifiedReason: "channel_owned_by_real_user",
          stubClassificationReason: "stub_has_phone",
          channelCode: "telegram",
          externalId: "tg_1",
        }),
      }),
    );
    expect(sendAdminIncidentRelayAlertMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("does not relay ownership conflict when upsert is repeat (insertedFirst false)", async () => {
    setChannelLinkBindingConflictReporter(vi.fn());
    upsertMock.mockResolvedValueOnce({ kind: "conflict", insertedFirst: false });
    classifyMock.mockResolvedValueOnce({ kind: "real", reason: "stub_has_oauth" });

    queryMock
      .mockResolvedValueOnce({ rows: [freshSecretRow()] })
      .mockResolvedValueOnce({ rows: [{ user_id: "u2" }] });

    await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(sendAdminIncidentRelayAlertMock).not.toHaveBeenCalled();
    expect(upsertMock).toHaveBeenCalled();
  });

  it("disposable stub: claim in tx, marks success without merge or conflict audit", async () => {
    setChannelLinkBindingConflictReporter(vi.fn());
    classifyMock.mockResolvedValue({ kind: "disposable" });
    claimMock.mockResolvedValue(undefined);
    clientQueryMock.mockResolvedValue({ rows: [] });

    queryMock
      .mockResolvedValueOnce({ rows: [freshSecretRow()] })
      .mockResolvedValueOnce({ rows: [{ user_id: "u2" }] })
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
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(claimMock).toHaveBeenCalledTimes(1);
    const claimArgs = claimMock.mock.calls[0];
    expect(claimArgs?.[1]).toMatchObject({
      tokenUserId: "u1",
      stubUserId: "u2",
      channelCode: "telegram",
      externalId: "tg_1",
      secretRowId: "s1",
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("claim rejected → conflict audit + relay; rollback", async () => {
    setChannelLinkBindingConflictReporter(vi.fn());
    classifyMock.mockResolvedValue({ kind: "disposable" });
    claimMock.mockRejectedValueOnce(new ChannelLinkClaimRejectedError("stub_has_oauth"));
    clientQueryMock.mockResolvedValue({ rows: [] });

    queryMock
      .mockResolvedValueOnce({ rows: [freshSecretRow()] })
      .mockResolvedValueOnce({ rows: [{ user_id: "u2" }] });

    const res = await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(res).toMatchObject({ ok: false, code: "conflict", mergeReason: "channel_link_claim_rejected" });
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "channel_link_ownership_conflict",
        details: expect.objectContaining({
          classifiedReason: "channel_link_claim_rejected",
          stubClassificationReason: "stub_has_oauth",
        }),
      }),
    );
    expect(sendAdminIncidentRelayAlertMock).toHaveBeenCalled();
  });

  it("claim tx unexpected error → conflict without audit", async () => {
    setChannelLinkBindingConflictReporter(vi.fn());
    classifyMock.mockResolvedValue({ kind: "disposable" });
    claimMock.mockRejectedValueOnce(new Error("simulated_db_error"));
    clientQueryMock.mockResolvedValue({ rows: [] });

    queryMock
      .mockResolvedValueOnce({ rows: [freshSecretRow()] })
      .mockResolvedValueOnce({ rows: [{ user_id: "u2" }] });

    const res = await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(res).toMatchObject({ ok: false, code: "conflict", mergeReason: "channel_link_claim_failed" });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("marks token used when binding already exists for same user", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [freshSecretRow()] })
      .mockResolvedValueOnce({ rows: [{ user_id: "u1" }] })
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
    expect(classifyMock).not.toHaveBeenCalled();
  });

  it("rejects expired token", async () => {
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
