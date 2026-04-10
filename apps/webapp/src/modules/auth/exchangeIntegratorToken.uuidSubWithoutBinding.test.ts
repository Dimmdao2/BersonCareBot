import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { encodeBase64Url } from "@/shared/utils/base64url";

const cookieSet = vi.fn();

const { findByUserIdMock } = vi.hoisted(() => ({
  findByUserIdMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: cookieSet,
    get: vi.fn(),
  })),
}));

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
      DATABASE_URL: "postgresql://test/test",
      ALLOWED_TELEGRAM_IDS: "1",
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
import type { IdentityResolutionPort } from "./identityResolutionPort";
import { exchangeIntegratorToken } from "./service";

function buildWebappEntryToken(body: Record<string, unknown>): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = encodeBase64Url(JSON.stringify({ ...body, exp }));
  const secret = integratorWebappEntrySecret();
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

describe("exchangeIntegratorToken — UUID sub without messenger binding (Phase C)", () => {
  const platformUuid = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

  const identityResolutionPort: IdentityResolutionPort = {
    findByChannelBinding: vi.fn(async () => null),
    findOrCreateByChannelBinding: vi.fn(async () => {
      throw new Error("findOrCreateByChannelBinding should not run when there is no binding");
    }),
  };

  it("loads SessionUser from DB when sub is platform UUID and token has no bindings", async () => {
    cookieSet.mockClear();
    findByUserIdMock.mockResolvedValueOnce({
      userId: platformUuid,
      role: "client",
      displayName: "Canon",
      phone: "+79990000000",
      bindings: { telegramId: "111" },
    });

    const token = buildWebappEntryToken({
      sub: platformUuid,
      role: "client",
      displayName: "From token",
      purpose: "webapp-entry",
    });

    const result = await exchangeIntegratorToken(token, identityResolutionPort);
    expect(result).not.toBeNull();
    expect(result!.session.user.userId).toBe(platformUuid);
    expect(result!.session.user.phone).toBe("+79990000000");
    expect(findByUserIdMock).toHaveBeenCalledWith(platformUuid);
    expect(identityResolutionPort.findOrCreateByChannelBinding).not.toHaveBeenCalled();
    expect(cookieSet).toHaveBeenCalled();
  });

  it("returns null when UUID sub does not exist in platform_users", async () => {
    findByUserIdMock.mockResolvedValueOnce(null);
    const token = buildWebappEntryToken({
      sub: platformUuid,
      role: "client",
      purpose: "webapp-entry",
    });
    await expect(exchangeIntegratorToken(token, identityResolutionPort)).resolves.toBeNull();
  });
});
