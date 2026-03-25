import { describe, expect, it, vi } from "vitest";

const { setSessionFromUserMock } = vi.hoisted(() => ({
  setSessionFromUserMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/auth/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/auth/service")>();
  return {
    ...actual,
    setSessionFromUser: setSessionFromUserMock,
  };
});

import { inMemoryUserByPhonePort } from "@/infra/repos/inMemoryUserByPhone";
import { hashLoginTokenPlain } from "@/modules/auth/messengerLoginToken";
import { __testConfirmLoginTokenByHash } from "@/infra/repos/inMemoryLoginTokens";
import { POST as POST_POLL } from "./route";
import { POST as POST_START } from "../start/route";

function tokenFromDeepLink(deepLink: string | null | undefined): string {
  if (!deepLink) return "";
  try {
    const url = new URL(deepLink);
    return url.searchParams.get("start") ?? "";
  } catch {
    return "";
  }
}

describe("POST /api/auth/messenger/poll", () => {
  it("second poll returns resumed without calling setSession again", async () => {
    setSessionFromUserMock.mockClear();
    const phone = "+79993334455";
    await inMemoryUserByPhonePort.createOrBind(phone, {
      channel: "web",
      chatId: "poll-test-1",
      displayName: "Poll",
    });

    const startRes = await POST_START(
      new Request("http://localhost/api/auth/messenger/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, method: "telegram" }),
      })
    );
    const { deepLink } = (await startRes.json()) as { deepLink?: string | null };
    const token = tokenFromDeepLink(deepLink);
    expect(token).not.toBe("");
    const h = hashLoginTokenPlain(token);
    expect(__testConfirmLoginTokenByHash(h)).toBe(true);

    const req = (body: unknown) =>
      new Request("http://localhost/api/auth/messenger/poll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const first = await POST_POLL(req({ token }));
    expect(first.status).toBe(200);
    const j1 = (await first.json()) as { resumed?: boolean; status: string };
    expect(j1.status).toBe("confirmed");
    expect(j1.resumed).toBeUndefined();
    expect(setSessionFromUserMock).toHaveBeenCalledTimes(1);

    const second = await POST_POLL(req({ token }));
    expect(second.status).toBe(200);
    const j2 = (await second.json()) as { resumed?: boolean; status: string };
    expect(j2.status).toBe("confirmed");
    expect(j2.resumed).toBe(true);
    expect(setSessionFromUserMock).toHaveBeenCalledTimes(1);
  });
});
