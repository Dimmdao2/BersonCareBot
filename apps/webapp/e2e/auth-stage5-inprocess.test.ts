/**
 * In-process e2e: этап 5 — check-phone, oauth/start, messenger (с in-memory confirm).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/auth/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/auth/service")>();
  return {
    ...actual,
    setSessionFromUser: vi.fn().mockResolvedValue(undefined),
  };
});
import { POST as POST_CHECK } from "@/app/api/auth/check-phone/route";
import { POST as POST_OAUTH } from "@/app/api/auth/oauth/start/route";
import { POST as POST_MSTART } from "@/app/api/auth/messenger/start/route";
import { POST as POST_MPOLL } from "@/app/api/auth/messenger/poll/route";
import { inMemoryUserByPhonePort } from "@/infra/repos/inMemoryUserByPhone";
import { hashLoginTokenPlain } from "@/modules/auth/messengerLoginToken";
import { __testConfirmLoginTokenByHash } from "@/infra/repos/inMemoryLoginTokens";

function tokenFromDeepLink(deepLink: string | null | undefined): string {
  if (!deepLink) return "";
  try {
    const url = new URL(deepLink);
    return url.searchParams.get("start") ?? "";
  } catch {
    return "";
  }
}

describe("auth stage 5 (in-process)", () => {
  it("POST check-phone returns 400 on empty body", async () => {
    const res = await POST_CHECK(
      new Request("http://localhost/api/auth/check-phone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("POST oauth/start returns 501 when yandex not configured", async () => {
    const res = await POST_OAUTH(
      new Request("http://localhost/api/auth/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "yandex" }),
      })
    );
    expect(res.status).toBe(501);
  });

  it("messenger start + confirm + poll returns confirmed", async () => {
    const phone = "+79991112233";
    await inMemoryUserByPhonePort.createOrBind(phone, {
      channel: "web",
      chatId: "e2e-messenger-1",
      displayName: "E2E",
    });

    const startRes = await POST_MSTART(
      new Request("http://localhost/api/auth/messenger/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, method: "telegram" }),
      })
    );
    expect(startRes.status).toBe(200);
    const startJson = (await startRes.json()) as { ok?: boolean; deepLink?: string | null };
    expect(startJson.ok).toBe(true);
    const token = tokenFromDeepLink(startJson.deepLink);
    expect(token).not.toBe("");

    const h = hashLoginTokenPlain(token);
    expect(__testConfirmLoginTokenByHash(h)).toBe(true);

    const pollRes = await POST_MPOLL(
      new Request("http://localhost/api/auth/messenger/poll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      })
    );
    expect(pollRes.status).toBe(200);
    const pollJson = (await pollRes.json()) as { ok?: boolean; status?: string; resumed?: boolean };
    expect(pollJson.ok).toBe(true);
    expect(pollJson.status).toBe("confirmed");
    expect(pollJson.resumed).toBeUndefined();

    const poll2 = await POST_MPOLL(
      new Request("http://localhost/api/auth/messenger/poll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      })
    );
    expect(poll2.status).toBe(200);
    const poll2Json = (await poll2.json()) as { resumed?: boolean; status: string };
    expect(poll2Json.status).toBe("confirmed");
    expect(poll2Json.resumed).toBe(true);
  });
});
