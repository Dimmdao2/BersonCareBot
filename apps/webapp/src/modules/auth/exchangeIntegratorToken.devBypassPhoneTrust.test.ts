import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/shared/types/session";
import type { IdentityResolutionPort } from "./identityResolutionPort";

const cookieSet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: cookieSet,
    get: vi.fn(),
  })),
}));

const applyDevBypassMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/modules/auth/devBypassPlatformUserPhonePort", () => ({
  applyDevBypassPlatformUserPhoneInDb: (...args: unknown[]) => applyDevBypassMock(...args),
}));

const findByUserIdMock = vi.fn();
vi.mock("@/infra/repos/pgUserByPhone", () => ({
  pgUserByPhonePort: {
    findByUserId: findByUserIdMock,
  },
}));

vi.mock("@/config/env", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/config/env")>();
  return {
    ...mod,
    env: {
      ...mod.env,
      DATABASE_URL: "postgres://test:test@127.0.0.1:5432/test",
      ALLOW_DEV_AUTH_BYPASS: true,
    },
  };
});

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getIntegratorWebappEntrySecret: async () => "test-integrator-entry-secret",
  getTelegramBotToken: async () => "",
  getMaxBotApiKey: async () => "",
}));

import { exchangeIntegratorToken } from "./service";

describe("exchangeIntegratorToken — dev bypass + DB phone", () => {
  beforeEach(() => {
    cookieSet.mockClear();
    applyDevBypassMock.mockClear();
    findByUserIdMock.mockReset();
  });

  it("writes phone + patient_phone_trust_at for dev:client (patient tier)", async () => {
    findByUserIdMock.mockResolvedValue({
      userId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
      role: "client",
      displayName: "Demo Client",
      phone: "+79990000001",
      bindings: { telegramId: "111111111" },
    } satisfies SessionUser);

    const findOrCreateByChannelBinding = vi.fn(async () => ({
      user: {
        userId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
        role: "client" as const,
        displayName: "Demo Client",
        phone: undefined,
        bindings: { telegramId: "111111111" },
      },
      accountOutcome: "linked_existing" as const,
    }));
    const identityResolutionPort: IdentityResolutionPort = {
      findByChannelBinding: vi.fn(async () => null),
      findOrCreateByChannelBinding,
    };

    const result = await exchangeIntegratorToken("dev:client", identityResolutionPort);
    expect(result).not.toBeNull();
    expect(applyDevBypassMock).toHaveBeenCalledWith(
      "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
      "client",
      "+79990000001",
    );
    expect(findByUserIdMock).toHaveBeenCalledWith("aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee");
    expect(result!.session.user.phone).toBe("+79990000001");
  });

  it("writes phone only for dev:admin (no patient_phone_trust_at)", async () => {
    findByUserIdMock.mockResolvedValue({
      userId: "bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee",
      role: "admin",
      displayName: "Demo Admin",
      phone: "+79990000003",
      bindings: { telegramId: "333333333" },
    } satisfies SessionUser);

    const findOrCreateByChannelBinding = vi.fn(async () => ({
      user: {
        userId: "bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee",
        role: "admin" as const,
        displayName: "Demo Admin",
        phone: undefined,
        bindings: { telegramId: "333333333" },
      },
      accountOutcome: "linked_existing" as const,
    }));
    const identityResolutionPort: IdentityResolutionPort = {
      findByChannelBinding: vi.fn(async () => null),
      findOrCreateByChannelBinding,
    };

    const result = await exchangeIntegratorToken("dev:admin", identityResolutionPort);
    expect(result).not.toBeNull();
    expect(applyDevBypassMock).toHaveBeenCalledWith(
      "bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee",
      "admin",
      "+79990000003",
    );
    expect(findByUserIdMock).toHaveBeenCalledWith("bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee");
    expect(result!.session.user.phone).toBe("+79990000003");
  });

  it("forces preset role for dev:admin even when identity row is client", async () => {
    findByUserIdMock.mockResolvedValue({
      userId: "cccccccc-bbbb-4ccc-dddd-eeeeeeeeeeee",
      role: "client",
      displayName: "Demo Admin",
      phone: "+79990000003",
      bindings: { telegramId: "333333333" },
    } satisfies SessionUser);

    const findOrCreateByChannelBinding = vi.fn(async () => ({
      user: {
        userId: "cccccccc-bbbb-4ccc-dddd-eeeeeeeeeeee",
        role: "client" as const,
        displayName: "Demo Admin",
        phone: undefined,
        bindings: { telegramId: "333333333" },
      },
      accountOutcome: "linked_existing" as const,
    }));
    const identityResolutionPort: IdentityResolutionPort = {
      findByChannelBinding: vi.fn(async () => null),
      findOrCreateByChannelBinding,
    };

    const result = await exchangeIntegratorToken("dev:admin", identityResolutionPort);
    expect(result).not.toBeNull();
    expect(result!.session.user.role).toBe("admin");
    expect(result!.redirectTo).toBe("/app/doctor");
  });
});
