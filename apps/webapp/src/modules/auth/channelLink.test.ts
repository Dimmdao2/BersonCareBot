import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelLinkDbPort } from "./channelLinkPort";

const { sendAdminIncidentRelayAlertMock } = vi.hoisted(() => ({
  sendAdminIncidentRelayAlertMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/admin-incidents/sendAdminIncidentAlerts", () => ({
  notifyChannelLinkOwnershipConflictRelay: async (
    upsertResult: { kind: string; insertedFirst?: boolean },
    ctx: {
      channelCode: string;
      externalId: string;
      tokenUserId: string;
      existingUserId: string;
      classifiedReason: string;
    },
  ) => {
    if (upsertResult.kind !== "conflict" || !upsertResult.insertedFirst) return;
    await sendAdminIncidentRelayAlertMock({
      topic: "channel_link",
      dedupKey: `${ctx.channelCode}:${ctx.externalId}:${ctx.tokenUserId}:${ctx.existingUserId}`,
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

import {
  bindChannelLinkDbPort,
  completeChannelLinkFromIntegrator,
  setChannelLinkBindingConflictReporter,
  startChannelLink,
} from "./channelLink";

function freshSecretRow(overrides: Partial<{ id: string; userId: string }> = {}) {
  return {
    id: "s1",
    userId: "u1",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    usedAt: null,
    ...overrides,
  };
}

const port: ChannelLinkDbPort = {
  replaceChannelLinkSecret: vi.fn(),
  loadPlatformPhoneBindingInfo: vi.fn(),
  loadChannelLinkSecretByTokenHash: vi.fn(),
  loadChannelBindingUserId: vi.fn(),
  classifyChannelBindingOwnerForLink: vi.fn(),
  tryMergeChannelLinkOwners: vi.fn(),
  claimMessengerChannelBinding: vi.fn(),
  markChannelLinkSecretUsedIfUnused: vi.fn(),
  insertChannelBinding: vi.fn(),
  upsertBroadcastDefaultsAfterChannelBind: vi.fn(),
  markChannelLinkSecretUsed: vi.fn(),
  resolveCanonicalUserId: vi.fn(),
  recordOwnershipConflict: vi.fn(),
};

function mockedPort<K extends keyof ChannelLinkDbPort>(key: K) {
  return vi.mocked(port[key]);
}

describe("completeChannelLinkFromIntegrator", () => {
  beforeEach(() => {
    bindChannelLinkDbPort(port);
    for (const value of Object.values(port)) {
      vi.mocked(value).mockReset();
    }
    mockedPort("loadPlatformPhoneBindingInfo").mockResolvedValue({ needsPhone: false, phoneNormalized: "+79990001122" });
    mockedPort("resolveCanonicalUserId").mockImplementation(async (userId) => userId);
    mockedPort("recordOwnershipConflict").mockResolvedValue({ kind: "conflict", insertedFirst: true });
    sendAdminIncidentRelayAlertMock.mockClear();
  });

  afterEach(() => {
    setChannelLinkBindingConflictReporter((ctx) => {
      console.warn("[channel_link:binding_conflict]", ctx);
    });
  });

  it("returns conflict for real stub: audit + ownership relay on first insert; no claim tx", async () => {
    const reporter = vi.fn();
    setChannelLinkBindingConflictReporter(reporter);
    mockedPort("loadChannelLinkSecretByTokenHash").mockResolvedValueOnce(freshSecretRow());
    mockedPort("loadChannelBindingUserId").mockResolvedValueOnce("u2");
    mockedPort("classifyChannelBindingOwnerForLink").mockResolvedValueOnce({ kind: "real", reason: "stub_has_phone" });
    mockedPort("tryMergeChannelLinkOwners").mockResolvedValueOnce({
      ok: false,
      reason: "merge_blocked_distinct_real_users",
      candidateIds: ["u1", "u2"],
    });

    const res = await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(res).toMatchObject({ ok: false, code: "conflict", mergeReason: "merge_blocked_distinct_real_users" });
    expect(reporter).toHaveBeenCalledWith({
      channelCode: "telegram",
      externalId: "tg_1",
      tokenUserId: "u1",
      existingUserId: "u2",
    });
    expect(mockedPort("claimMessengerChannelBinding")).not.toHaveBeenCalled();
    expect(mockedPort("recordOwnershipConflict")).toHaveBeenCalledWith(
      {
        channelCode: "telegram",
        externalId: "tg_1",
        tokenUserId: "u1",
        existingUserId: "u2",
      },
      {
        classifiedReason: "merge_blocked_distinct_real_users",
        stubClassificationReason: "stub_has_phone",
      },
    );
    expect(sendAdminIncidentRelayAlertMock).toHaveBeenCalledTimes(1);
  });

  it("does not relay ownership conflict when upsert is repeat (insertedFirst false)", async () => {
    setChannelLinkBindingConflictReporter(vi.fn());
    mockedPort("recordOwnershipConflict").mockResolvedValueOnce({ kind: "conflict", insertedFirst: false });
    mockedPort("loadChannelLinkSecretByTokenHash").mockResolvedValueOnce(freshSecretRow());
    mockedPort("loadChannelBindingUserId").mockResolvedValueOnce("u2");
    mockedPort("classifyChannelBindingOwnerForLink").mockResolvedValueOnce({ kind: "real", reason: "stub_has_oauth" });
    mockedPort("tryMergeChannelLinkOwners").mockResolvedValueOnce({
      ok: false,
      reason: "merge_blocked_distinct_real_users",
      candidateIds: ["u1", "u2"],
    });

    await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(sendAdminIncidentRelayAlertMock).not.toHaveBeenCalled();
    expect(mockedPort("recordOwnershipConflict")).toHaveBeenCalled();
  });

  it("disposable stub: claim in tx, marks success without merge or conflict audit", async () => {
    setChannelLinkBindingConflictReporter(vi.fn());
    mockedPort("loadChannelLinkSecretByTokenHash").mockResolvedValueOnce(freshSecretRow());
    mockedPort("loadChannelBindingUserId").mockResolvedValueOnce("u2");
    mockedPort("classifyChannelBindingOwnerForLink").mockResolvedValue({ kind: "disposable" });
    mockedPort("claimMessengerChannelBinding").mockResolvedValue({ ok: true });

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
    expect(mockedPort("claimMessengerChannelBinding")).toHaveBeenCalledWith({
      tokenUserId: "u1",
      stubUserId: "u2",
      channelCode: "telegram",
      externalId: "tg_1",
      secretRowId: "s1",
    });
    expect(mockedPort("recordOwnershipConflict")).not.toHaveBeenCalled();
  });

  it("claim rejected -> conflict audit + relay", async () => {
    setChannelLinkBindingConflictReporter(vi.fn());
    mockedPort("loadChannelLinkSecretByTokenHash").mockResolvedValueOnce(freshSecretRow());
    mockedPort("loadChannelBindingUserId").mockResolvedValueOnce("u2");
    mockedPort("classifyChannelBindingOwnerForLink").mockResolvedValue({ kind: "disposable" });
    mockedPort("claimMessengerChannelBinding").mockResolvedValueOnce({
      ok: false,
      code: "rejected",
      reason: "stub_has_oauth",
    });

    const res = await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(res).toMatchObject({ ok: false, code: "conflict", mergeReason: "channel_link_claim_rejected" });
    expect(mockedPort("recordOwnershipConflict")).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        classifiedReason: "channel_link_claim_rejected",
        stubClassificationReason: "stub_has_oauth",
      }),
    );
    expect(sendAdminIncidentRelayAlertMock).toHaveBeenCalled();
  });

  it("claim tx unexpected error -> conflict without audit", async () => {
    setChannelLinkBindingConflictReporter(vi.fn());
    mockedPort("loadChannelLinkSecretByTokenHash").mockResolvedValueOnce(freshSecretRow());
    mockedPort("loadChannelBindingUserId").mockResolvedValueOnce("u2");
    mockedPort("classifyChannelBindingOwnerForLink").mockResolvedValue({ kind: "disposable" });
    mockedPort("claimMessengerChannelBinding").mockResolvedValueOnce({
      ok: false,
      code: "failed",
      err: new Error("simulated_db_error"),
    });

    const res = await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(res).toMatchObject({ ok: false, code: "conflict", mergeReason: "channel_link_claim_failed" });
    expect(mockedPort("recordOwnershipConflict")).not.toHaveBeenCalled();
  });

  it("marks token used when binding already exists for same user", async () => {
    mockedPort("loadChannelLinkSecretByTokenHash").mockResolvedValueOnce(freshSecretRow());
    mockedPort("loadChannelBindingUserId").mockResolvedValueOnce("u1");

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
    expect(mockedPort("markChannelLinkSecretUsedIfUnused")).toHaveBeenCalledWith("s1");
    expect(mockedPort("classifyChannelBindingOwnerForLink")).not.toHaveBeenCalled();
  });

  it("rejects expired token", async () => {
    mockedPort("loadChannelLinkSecretByTokenHash").mockResolvedValueOnce({
      ...freshSecretRow(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const res = await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(res).toEqual({ ok: false, code: "unknown_or_expired" });
  });

  it("rejects already used token", async () => {
    mockedPort("loadChannelLinkSecretByTokenHash").mockResolvedValueOnce({
      ...freshSecretRow(),
      usedAt: new Date().toISOString(),
    });
    mockedPort("loadPlatformPhoneBindingInfo").mockResolvedValueOnce({ needsPhone: true });

    const res = await completeChannelLinkFromIntegrator({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "tg_1",
    });

    expect(res).toEqual({ ok: false, code: "used_token", needsPhone: true });
  });
});

describe("startChannelLink", () => {
  beforeEach(() => {
    bindChannelLinkDbPort(port);
    for (const value of Object.values(port)) {
      vi.mocked(value).mockReset();
    }
  });

  it("creates max link challenge and returns manual command when nick missing", async () => {
    mockedPort("replaceChannelLinkSecret").mockResolvedValue(undefined);

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
    expect(mockedPort("replaceChannelLinkSecret")).toHaveBeenCalled();
  });

  it("creates max deep link when maxBotNickname is set", async () => {
    mockedPort("replaceChannelLinkSecret").mockResolvedValue(undefined);

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
