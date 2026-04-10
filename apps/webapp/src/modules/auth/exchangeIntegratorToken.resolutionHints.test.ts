import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { encodeBase64Url } from "@/shared/utils/base64url";

const cookieSet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: cookieSet,
    get: vi.fn(),
  })),
}));

vi.mock("@/config/env", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/config/env")>();
  return {
    ...mod,
    env: {
      ...mod.env,
      ALLOWED_TELEGRAM_IDS: "999000111",
      ADMIN_TELEGRAM_ID: 0,
      DOCTOR_TELEGRAM_IDS: "",
    },
  };
});

vi.mock("@/modules/system-settings/configAdapter", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/modules/system-settings/configAdapter")>();
  return {
    ...mod,
    getConfigValue: async (_key: string, envFallback: string) => envFallback,
  };
});

import { integratorWebappEntrySecret } from "@/config/env";
import type { SessionUser } from "@/shared/types/session";
import type { IdentityResolutionPort } from "./identityResolutionPort";
import { exchangeIntegratorToken } from "./service";

const CLIENT_TG = "999000111";

type FindOrCreateParams = Parameters<IdentityResolutionPort["findOrCreateByChannelBinding"]>[0];

function firstFindOrCreateCall(
  mockFn: ReturnType<typeof vi.fn>,
): FindOrCreateParams | undefined {
  const calls = mockFn.mock.calls as unknown as [FindOrCreateParams][];
  return calls[0]?.[0];
}

function buildWebappEntryToken(body: Record<string, unknown>): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = encodeBase64Url(JSON.stringify({ ...body, exp }));
  const secret = integratorWebappEntrySecret();
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

describe("exchangeIntegratorToken — resolutionHints (Phase B)", () => {
  it("passes platformUserSub, integratorUserId, phoneNormalized when present on token", async () => {
    cookieSet.mockClear();
    const platformUuid = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
    const findOrCreateByChannelBinding = vi.fn(async (): Promise<SessionUser> => ({
      userId: platformUuid,
      role: "client",
      displayName: "Test",
      phone: "+79991234567",
      bindings: { telegramId: CLIENT_TG },
    }));
    const identityResolutionPort: IdentityResolutionPort = {
      findByChannelBinding: vi.fn(async () => null),
      findOrCreateByChannelBinding,
    };

    const token = buildWebappEntryToken({
      sub: platformUuid,
      role: "client",
      displayName: "Test",
      phone: "+79991234567",
      integratorUserId: "987654321",
      bindings: { telegramId: CLIENT_TG },
      purpose: "webapp-entry",
    });

    const result = await exchangeIntegratorToken(token, identityResolutionPort);
    expect(result).not.toBeNull();
    const callParams = firstFindOrCreateCall(findOrCreateByChannelBinding);
    expect(callParams).toMatchObject({
      channelCode: "telegram",
      externalId: CLIENT_TG,
      resolutionHints: {
        platformUserSub: platformUuid,
        integratorUserId: "987654321",
        phoneNormalized: "+79991234567",
      },
    });
  });

  it("does not set platformUserSub when sub is external (e.g. tg:…)", async () => {
    cookieSet.mockClear();
    const findOrCreateByChannelBinding = vi.fn(async (): Promise<SessionUser> => ({
      userId: "u1",
      role: "client",
      displayName: "Test",
      phone: undefined,
      bindings: { telegramId: CLIENT_TG },
    }));
    const identityResolutionPort: IdentityResolutionPort = {
      findByChannelBinding: vi.fn(async () => null),
      findOrCreateByChannelBinding,
    };

    const token = buildWebappEntryToken({
      sub: "tg:123456789",
      role: "client",
      displayName: "Test",
      phone: "+79991234567",
      bindings: { telegramId: CLIENT_TG },
      purpose: "webapp-entry",
    });

    await exchangeIntegratorToken(token, identityResolutionPort);
    const params = firstFindOrCreateCall(findOrCreateByChannelBinding);
    expect(params?.resolutionHints).toEqual({ phoneNormalized: "+79991234567" });
  });

  it("resolves messenger binding from sub when bindings are omitted (tg:…)", async () => {
    cookieSet.mockClear();
    const findOrCreateByChannelBinding = vi.fn(async (): Promise<SessionUser> => ({
      userId: "u1",
      role: "client",
      displayName: "Test",
      phone: undefined,
      bindings: { telegramId: CLIENT_TG },
    }));
    const identityResolutionPort: IdentityResolutionPort = {
      findByChannelBinding: vi.fn(async () => null),
      findOrCreateByChannelBinding,
    };

    const token = buildWebappEntryToken({
      sub: `tg:${CLIENT_TG}`,
      role: "client",
      purpose: "webapp-entry",
    });

    await exchangeIntegratorToken(token, identityResolutionPort);
    const params = firstFindOrCreateCall(findOrCreateByChannelBinding);
    expect(params).toMatchObject({
      channelCode: "telegram",
      externalId: CLIENT_TG,
    });
    expect(params?.resolutionHints).toBeUndefined();
  });
});
