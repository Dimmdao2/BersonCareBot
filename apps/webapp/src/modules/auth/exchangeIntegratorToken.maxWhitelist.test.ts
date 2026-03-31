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
      ADMIN_PHONES: "+79990000003",
      ALLOWED_MAX_IDS: "",
      ADMIN_MAX_IDS: "",
      DOCTOR_MAX_IDS: "",
    },
  };
});

/** CI may have DATABASE_URL + system_settings rows that override env; force env fallback like local tests. */
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

function buildWebappEntryToken(params: {
  sub: string;
  maxId: string;
  displayName: string;
}): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const body = {
    sub: params.sub,
    role: "client" as const,
    displayName: params.displayName,
    bindings: { maxId: params.maxId },
    purpose: "webapp-entry" as const,
    exp,
  };
  const payload = encodeBase64Url(JSON.stringify(body));
  const secret = integratorWebappEntrySecret();
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

describe("exchangeIntegratorToken — whitelist via existing binding", () => {
  it("accepts MAX token when bound user has admin phone", async () => {
    cookieSet.mockClear();
    const token = buildWebappEntryToken({
      sub: "max:555123",
      maxId: "555123",
      displayName: "Max Admin",
    });

    const identityResolutionPort: IdentityResolutionPort = {
      findByChannelBinding: vi.fn(async () => ({
        userId: "platform-user-admin",
        role: "client" as const,
        displayName: "Existing Admin",
        phone: "+79990000003",
        bindings: { maxId: "555123" },
      })),
      findOrCreateByChannelBinding: vi.fn(async () => ({
        userId: "platform-user-admin",
        role: "client" as const,
        displayName: "Existing Admin",
        phone: "+79990000003",
        bindings: { maxId: "555123" },
      })),
    };

    const result = await exchangeIntegratorToken(token, identityResolutionPort);
    expect(result).not.toBeNull();
    expect(result?.session.user.role).toBe("admin");
    expect(cookieSet).toHaveBeenCalled();
  });
});

