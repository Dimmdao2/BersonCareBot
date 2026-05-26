import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPgPhoneMessengerBindPort } from "@/infra/repos/pgPhoneMessengerBind";
import { inMemoryPhoneChallengeStore } from "@/infra/repos/inMemoryPhoneChallengeStore";
import { inMemoryUserByPhonePort } from "@/infra/repos/inMemoryUserByPhone";

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

vi.mock("@/infra/repos/pgCanonicalPlatformUser", () => ({
  resolveCanonicalUserId: vi.fn(async (_c: unknown, id: string) => id),
  findCanonicalUserIdByPhone: vi.fn(),
}));

vi.mock("@/infra/repos/pgPhoneHistory", () => ({
  applyPlatformUserPhoneHistoryTransition: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/infra/upsertBroadcastDefaultsAfterChannelBind", () => ({
  upsertBroadcastDefaultsAfterChannelBind: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/infra/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/config/env", () => ({
  env: { DATABASE_URL: "postgres://test" },
  integratorWebhookSecret: () => "test-secret",
}));

vi.mock("./phoneAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./phoneAuth")>();
  return {
    ...actual,
    createPhoneOtpChallenge: vi.fn().mockResolvedValue({
      ok: true,
      challengeId: "ch-mock-1",
      code: "654321",
      retryAfterSeconds: 60,
    }),
  };
});

import {
  completePhoneMessengerBindFromIntegrator,
  getPhoneMessengerBindStatus,
  registerPhoneMessengerBindPort,
  resolvePhoneMessengerBindLoginChallenge,
  startPhoneMessengerBind,
} from "./phoneMessengerBind";
import { createPhoneOtpChallenge } from "./phoneAuth";

const mockPool = {
  query: queryMock,
  connect: connectMock,
} as never;

const phoneAuthDeps = {
  challengeStore: inMemoryPhoneChallengeStore,
  smsPort: {} as never,
  userByPhonePort: inMemoryUserByPhonePort,
};

function secretRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sec-1",
    phone_normalized: "+79991234567",
    channel_code: "telegram",
    purpose: "login",
    user_id: null,
    status: "pending_contact",
    challenge_id: null,
    failure_code: null,
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    consumed_at: null,
    ...overrides,
  };
}

describe("phoneMessengerBind", () => {
  beforeEach(() => {
    registerPhoneMessengerBindPort(createPgPhoneMessengerBindPort(mockPool));
    vi.mocked(createPhoneOtpChallenge).mockClear();
  });

  afterEach(() => {
    registerPhoneMessengerBindPort(null);
    queryMock.mockReset();
    clientQueryMock.mockReset();
    connectMock.mockClear();
  });

  it("startPhoneMessengerBind returns auth_* setupToken", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const res = await startPhoneMessengerBind({
      phone: "+79991234567",
      channelCode: "telegram",
      purpose: "login",
      botUsername: "test_bot",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.setupToken).toMatch(/^auth_/);
      expect(res.url).toContain("test_bot");
    }
    expect(queryMock).toHaveBeenCalled();
  });

  it("complete happy path sets otp_ready and returns challenge", async () => {
    queryMock.mockResolvedValueOnce({ rows: [secretRow()] });
    clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "u-new" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: "u-new" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await completePhoneMessengerBindFromIntegrator(
      {
        setupToken: "auth_testtoken",
        channelCode: "telegram",
        externalId: "tg-1",
        contactPhoneNormalized: "+79991234567",
      },
      phoneAuthDeps,
    );

    expect(res).toMatchObject({
      ok: true,
      purpose: "login",
      accountCreated: true,
      challengeId: expect.any(String),
      otpCode: expect.any(String),
    });
    expect(connectMock).toHaveBeenCalled();
  });

  it("returns phone_mismatch when contact phone differs", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [secretRow()] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await completePhoneMessengerBindFromIntegrator(
      {
        setupToken: "auth_testtoken",
        channelCode: "telegram",
        externalId: "tg-1",
        contactPhoneNormalized: "+79990000000",
      },
      phoneAuthDeps,
    );

    expect(res).toEqual({ ok: false, code: "phone_mismatch" });
  });

  it("returns expired when secret TTL passed", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [secretRow({ expires_at: new Date(Date.now() - 60_000).toISOString() })],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await completePhoneMessengerBindFromIntegrator(
      {
        setupToken: "auth_testtoken",
        channelCode: "telegram",
        externalId: "tg-1",
        contactPhoneNormalized: "+79991234567",
      },
      phoneAuthDeps,
    );

    expect(res).toEqual({ ok: false, code: "expired" });
  });

  it("returns used_token when secret consumed", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [secretRow({ status: "consumed", consumed_at: new Date().toISOString() })],
    });

    const res = await completePhoneMessengerBindFromIntegrator(
      {
        setupToken: "auth_testtoken",
        channelCode: "telegram",
        externalId: "tg-1",
        contactPhoneNormalized: "+79991234567",
      },
      phoneAuthDeps,
    );

    expect(res).toEqual({ ok: false, code: "used_token" });
  });

  it("replays otp_ready with code from challenge store", async () => {
    const challengeId = "ch-replay-1";
    await inMemoryPhoneChallengeStore.set(challengeId, {
      phone: "+79991234567",
      expiresAt: Math.floor(Date.now() / 1000) + 600,
      code: "123456",
      deliveryChannel: "telegram",
    });

    queryMock.mockResolvedValueOnce({
      rows: [secretRow({ status: "otp_ready", challenge_id: challengeId })],
    });

    const res = await completePhoneMessengerBindFromIntegrator(
      {
        setupToken: "auth_testtoken",
        channelCode: "telegram",
        externalId: "tg-1",
        contactPhoneNormalized: "+79991234567",
      },
      phoneAuthDeps,
    );

    expect(res).toMatchObject({
      ok: true,
      purpose: "login",
      otpCode: "123456",
      challengeId,
      replay: true,
      accountCreated: false,
    });
  });

  it("profile_bind complete marks consumed without otp challenge", async () => {
    queryMock.mockResolvedValueOnce({ rows: [secretRow({ purpose: "profile_bind", user_id: "u-session" })] });
    clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "u-session" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: "u-session" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const createOtpMock = vi.mocked(createPhoneOtpChallenge);

    const res = await completePhoneMessengerBindFromIntegrator(
      {
        setupToken: "auth_testtoken",
        channelCode: "telegram",
        externalId: "tg-1",
        contactPhoneNormalized: "+79991234567",
      },
      phoneAuthDeps,
    );

    expect(res).toEqual({ ok: true, purpose: "profile_bind" });
    expect(createOtpMock).not.toHaveBeenCalled();
    expect(clientQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("status = 'consumed'"),
      expect.any(Array),
    );
  });

  it("profile_bind rejects phone owned by other user", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [secretRow({ purpose: "profile_bind", user_id: "u-session" })],
    });
    clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "u-other" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await completePhoneMessengerBindFromIntegrator(
      {
        setupToken: "auth_testtoken",
        channelCode: "telegram",
        externalId: "tg-1",
        contactPhoneNormalized: "+79991234567",
      },
      phoneAuthDeps,
    );

    expect(res).toEqual({ ok: false, code: "phone_owned_by_other_user" });
  });

  it("getPhoneMessengerBindStatus returns otp_ready with challengeId", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [secretRow({ status: "otp_ready", challenge_id: "ch-1" })],
    });

    const res = await getPhoneMessengerBindStatus("auth_testtoken");
    expect(res).toMatchObject({ ok: true, status: "otp_ready", challengeId: "ch-1" });
  });

  it("resolveLoginChallenge returns challenge and code when otp_ready", async () => {
    const challengeId = "ch-finish-1";
    await inMemoryPhoneChallengeStore.set(challengeId, {
      phone: "+79991234567",
      expiresAt: Math.floor(Date.now() / 1000) + 600,
      code: "987654",
      deliveryChannel: "telegram",
    });
    queryMock.mockResolvedValueOnce({
      rows: [secretRow({ status: "otp_ready", challenge_id: challengeId })],
    });

    const res = await resolvePhoneMessengerBindLoginChallenge("auth_testtoken", phoneAuthDeps);
    expect(res).toEqual({ ok: true, challengeId, code: "987654" });
  });

  it("resolveLoginChallenge returns not_ready when pending_contact", async () => {
    queryMock.mockResolvedValueOnce({ rows: [secretRow()] });
    const res = await resolvePhoneMessengerBindLoginChallenge("auth_testtoken", phoneAuthDeps);
    expect(res).toEqual({ ok: false, code: "not_ready" });
  });

  it("resolveLoginChallenge returns wrong_purpose for profile_bind", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [secretRow({ purpose: "profile_bind", status: "otp_ready", challenge_id: "ch-x" })],
    });
    const res = await resolvePhoneMessengerBindLoginChallenge("auth_testtoken", phoneAuthDeps);
    expect(res).toEqual({ ok: false, code: "wrong_purpose" });
  });

  it("resolveLoginChallenge returns already_consumed", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [secretRow({ status: "consumed", consumed_at: new Date().toISOString() })],
    });
    const res = await resolvePhoneMessengerBindLoginChallenge("auth_testtoken", phoneAuthDeps);
    expect(res).toEqual({ ok: false, code: "already_consumed" });
  });

  it("resolveLoginChallenge returns challenge_expired when store empty", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [secretRow({ status: "otp_ready", challenge_id: "ch-missing" })],
    });
    const res = await resolvePhoneMessengerBindLoginChallenge("auth_testtoken", phoneAuthDeps);
    expect(res).toEqual({ ok: false, code: "challenge_expired" });
  });

  it("resolveLoginChallenge returns invalid_token for malformed setupToken", async () => {
    const res = await resolvePhoneMessengerBindLoginChallenge("not_auth_token", phoneAuthDeps);
    expect(res).toEqual({ ok: false, code: "invalid_token" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("resolveLoginChallenge returns not_found when secret missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await resolvePhoneMessengerBindLoginChallenge("auth_testtoken", phoneAuthDeps);
    expect(res).toEqual({ ok: false, code: "not_found" });
  });

  it("resolveLoginChallenge returns expired when TTL passed before otp_ready", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        secretRow({
          status: "pending_contact",
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        }),
      ],
    });
    const res = await resolvePhoneMessengerBindLoginChallenge("auth_testtoken", phoneAuthDeps);
    expect(res).toEqual({ ok: false, code: "expired" });
  });
});
