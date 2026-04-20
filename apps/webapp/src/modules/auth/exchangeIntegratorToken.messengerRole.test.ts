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
      ADMIN_TELEGRAM_ID: 501112233,
      DOCTOR_TELEGRAM_IDS: "887766554",
      ALLOWED_TELEGRAM_IDS: "999000111",
    },
  };
});

import { integratorWebappEntrySecret } from "@/config/env";
import { getRedirectPathForRole } from "./redirectPolicy";
import { exchangeIntegratorToken } from "./service";

const ADMIN_TG = "501112233";
const DOCTOR_TG = "887766554";
const CLIENT_TG = "999000111";

function buildWebappEntryToken(params: {
  sub: string;
  bindings: { telegramId: string };
  displayName: string;
}): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const body = {
    sub: params.sub,
    role: "client" as const,
    displayName: params.displayName,
    bindings: params.bindings,
    purpose: "webapp-entry" as const,
    exp,
  };
  const payload = encodeBase64Url(JSON.stringify(body));
  const secret = integratorWebappEntrySecret();
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

describe("exchangeIntegratorToken — роли по telegramId (I.4)", () => {
  it("ADMIN_TELEGRAM_ID → session.user.role === admin", async () => {
    cookieSet.mockClear();
    const token = buildWebappEntryToken({
      sub: "platform-user-admin-tg",
      bindings: { telegramId: ADMIN_TG },
      displayName: "Admin From TG",
    });
    const result = await exchangeIntegratorToken(token);
    expect(result).not.toBeNull();
    expect(result!.session.user.role).toBe("admin");
    expect(result!.redirectTo).toBe(getRedirectPathForRole("admin"));
    expect(result!.setMessengerPlatformCookie).toBe(true);
    expect(cookieSet).toHaveBeenCalled();
  });

  it("DOCTOR_TELEGRAM_IDS → session.user.role === doctor (токен с role client)", async () => {
    cookieSet.mockClear();
    const token = buildWebappEntryToken({
      sub: "platform-user-doc-tg",
      bindings: { telegramId: DOCTOR_TG },
      displayName: "Doctor From TG",
    });
    const result = await exchangeIntegratorToken(token);
    expect(result).not.toBeNull();
    expect(result!.session.user.role).toBe("doctor");
    expect(result!.redirectTo).toBe(getRedirectPathForRole("doctor"));
    expect(result!.setMessengerPlatformCookie).toBe(true);
    expect(cookieSet).toHaveBeenCalled();
  });

  it("обычный пользователь (whitelist) → session.user.role === client (пациентский workspace)", async () => {
    cookieSet.mockClear();
    const token = buildWebappEntryToken({
      sub: "platform-user-patient-tg",
      bindings: { telegramId: CLIENT_TG },
      displayName: "Patient From TG",
    });
    const result = await exchangeIntegratorToken(token);
    expect(result).not.toBeNull();
    expect(result!.session.user.role).toBe("client");
    expect(result!.redirectTo).toBe(getRedirectPathForRole("client"));
    expect(result!.setMessengerPlatformCookie).toBe(true);
    expect(cookieSet).toHaveBeenCalled();
  });

  it("dev bypass не помечает сессию как messenger platform cookie (синтетический telegramId)", async () => {
    cookieSet.mockClear();
    const result = await exchangeIntegratorToken("dev:admin");
    expect(result).not.toBeNull();
    expect(result!.setMessengerPlatformCookie).toBe(false);
    expect(cookieSet).toHaveBeenCalled();
  });
});
