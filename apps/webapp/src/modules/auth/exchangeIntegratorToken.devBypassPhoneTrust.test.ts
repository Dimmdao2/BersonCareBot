import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/shared/types/session";
import type { IdentityResolutionPort } from "./identityResolutionPort";
import {
  enterWithDbBootstrapPrincipal,
  getCurrentDbPrincipal,
} from "@bersoncare/db-principal";

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

const ensureStaffWorkspaceMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/modules/auth/devBypassClinicAdminWorkspacePort", () => ({
  ensureDevBypassStaffWorkspace: (...args: unknown[]) => ensureStaffWorkspaceMock(...args),
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
      NODE_ENV: "development",
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
    enterWithDbBootstrapPrincipal({ source: "exchange-dev-bypass-test-reset" });
    cookieSet.mockClear();
    applyDevBypassMock.mockClear();
    ensureStaffWorkspaceMock.mockClear();
    findByUserIdMock.mockReset();
  });

  it("writes phone + patient_phone_trust_at for dev:client (patient tier)", async () => {
    findByUserIdMock.mockResolvedValue({
      userId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      role: "client",
      displayName: "Demo Client",
      phone: "+79990000001",
      bindings: { telegramId: "111111111" },
    } satisfies SessionUser);

    const findByChannelBinding = vi.fn(async () => ({
      userId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      role: "client" as const,
      displayName: "Demo Client",
      phone: undefined,
      bindings: { telegramId: "111111111" },
    }));
    const findOrCreateByChannelBinding = vi.fn(async () => {
      throw new Error("dev bypass must not create a messenger binding");
    });
    const identityResolutionPort: IdentityResolutionPort = {
      findByChannelBinding,
      findOrCreateByChannelBinding,
    };

    const result = await exchangeIntegratorToken("dev:client", identityResolutionPort);
    expect(result).not.toBeNull();
    expect(applyDevBypassMock).toHaveBeenCalledWith(
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      "client",
      "+79990000001",
    );
    expect(findByUserIdMock).toHaveBeenCalledWith("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(findByChannelBinding).toHaveBeenCalledWith({
      channelCode: "telegram",
      externalId: "111111111",
    });
    expect(findOrCreateByChannelBinding).not.toHaveBeenCalled();
    expect(result!.session.user.phone).toBe("+79990000001");
  });

  it("writes phone only for dev:admin (no patient_phone_trust_at)", async () => {
    const adminUserId = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    applyDevBypassMock.mockImplementationOnce(async () => {
      expect(getCurrentDbPrincipal()).toMatchObject({
        kind: "patient",
        platformUserId: adminUserId,
      });
    });
    findByUserIdMock.mockImplementationOnce(async () => {
      expect(getCurrentDbPrincipal()).toMatchObject({
        kind: "patient",
        platformUserId: adminUserId,
      });
      return {
        userId: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        role: "admin",
        displayName: "Demo Admin",
        phone: "+79990000003",
        bindings: { telegramId: "333333333" },
      } satisfies SessionUser;
    });

    const findOrCreateByChannelBinding = vi.fn(async () => {
      throw new Error("dev bypass must not create a messenger binding");
    });
    const identityResolutionPort: IdentityResolutionPort = {
      findByChannelBinding: vi.fn(async () => ({
        userId: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        role: "admin" as const,
        displayName: "Demo Admin",
        phone: undefined,
        bindings: { telegramId: "333333333" },
      })),
      findOrCreateByChannelBinding,
    };

    const result = await exchangeIntegratorToken("dev:admin", identityResolutionPort);
    expect(result).not.toBeNull();
    expect(applyDevBypassMock).toHaveBeenCalledWith(
      "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      "admin",
      "+79990000003",
    );
    expect(findByUserIdMock).toHaveBeenCalledWith("bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(result!.session.user.phone).toBe("+79990000003");
    expect(ensureStaffWorkspaceMock).toHaveBeenCalledWith({
      platformUserId: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      displayName: "Demo Admin",
      kind: "global_admin",
    });
  });

  it("forces preset role for dev:admin even when identity row is client", async () => {
    findByUserIdMock.mockResolvedValue({
      userId: "cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      role: "client",
      displayName: "Demo Admin",
      phone: "+79990000003",
      bindings: { telegramId: "333333333" },
    } satisfies SessionUser);

    const findOrCreateByChannelBinding = vi.fn(async () => {
      throw new Error("dev bypass must not create a messenger binding");
    });
    const identityResolutionPort: IdentityResolutionPort = {
      findByChannelBinding: vi.fn(async () => ({
        userId: "cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        role: "client" as const,
        displayName: "Demo Admin",
        phone: undefined,
        bindings: { telegramId: "333333333" },
      })),
      findOrCreateByChannelBinding,
    };

    const result = await exchangeIntegratorToken("dev:admin", identityResolutionPort);
    expect(result).not.toBeNull();
    expect(result!.session.user.role).toBe("admin");
    expect(result!.session.adminMode).toBe(true);
    expect(result!.redirectTo).toBe("/app/doctor");
  });

  it("provisions an owner workspace for dev:clinic-admin while keeping the doctor platform role", async () => {
    findByUserIdMock.mockResolvedValue({
      userId: "dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      role: "doctor",
      displayName: "Demo Clinic Owner",
      phone: "+79990000004",
      bindings: { telegramId: "999999999999004" },
    } satisfies SessionUser);

    const identityResolutionPort: IdentityResolutionPort = {
      findByChannelBinding: vi.fn(async () => ({
        userId: "dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        role: "doctor" as const,
        displayName: "Demo Clinic Owner",
        bindings: { telegramId: "999999999999004" },
      })),
      findOrCreateByChannelBinding: vi.fn(async () => {
        throw new Error("dev bypass must not create a messenger binding");
      }),
    };

    const result = await exchangeIntegratorToken("dev:clinic-admin", identityResolutionPort);

    expect(result?.session.user.role).toBe("doctor");
    expect(result?.session.adminMode).toBeUndefined();
    expect(ensureStaffWorkspaceMock).toHaveBeenCalledWith({
      platformUserId: "dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      displayName: "Demo Clinic Owner",
      kind: "clinic_admin",
    });
  });

  it("provisions a specialist workspace for dev:doctor without admin semantics", async () => {
    findByUserIdMock.mockResolvedValue({
      userId: "eeeeeeee-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      role: "doctor",
      displayName: "Demo Doctor",
      phone: "+79990000002",
      bindings: { telegramId: "222222222" },
    } satisfies SessionUser);

    const identityResolutionPort: IdentityResolutionPort = {
      findByChannelBinding: vi.fn(async () => ({
        userId: "eeeeeeee-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        role: "doctor" as const,
        displayName: "Demo Doctor",
        bindings: { telegramId: "222222222" },
      })),
      findOrCreateByChannelBinding: vi.fn(async () => {
        throw new Error("dev bypass must not create a messenger binding");
      }),
    };

    const result = await exchangeIntegratorToken("dev:doctor", identityResolutionPort);

    expect(result?.session.user.role).toBe("doctor");
    expect(result?.session.adminMode).toBeUndefined();
    expect(ensureStaffWorkspaceMock).toHaveBeenCalledWith({
      platformUserId: "eeeeeeee-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      displayName: "Demo Doctor",
      kind: "doctor",
    });
  });
});
