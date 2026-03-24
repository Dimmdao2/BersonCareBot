import { describe, expect, it, vi } from "vitest";

const { getCurrentSessionMock } = vi.hoisted(() => ({
  getCurrentSessionMock: vi.fn(),
}));

vi.mock("@/modules/auth/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/auth/service")>();
  return {
    ...actual,
    getCurrentSession: getCurrentSessionMock,
  };
});

import { inMemoryUserByPhonePort } from "@/infra/repos/inMemoryUserByPhone";
import { inMemoryUserPinsPort } from "@/infra/repos/inMemoryUserPins";
import type { AppSession } from "@/shared/types/session";
import { POST } from "./route";

describe("POST /api/auth/pin/set", () => {
  it("returns 401 without session", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/auth/pin/set", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin: "1234", pinConfirm: "1234" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 and stores hash when session valid", async () => {
    const phone = "+79994445566";
    await inMemoryUserByPhonePort.createOrBind(phone, {
      channel: "web",
      chatId: "pin-set-test",
      displayName: "P",
    });
    const u = await inMemoryUserByPhonePort.findByPhone(phone);
    const now = Math.floor(Date.now() / 1000);
    const session: AppSession = {
      user: u!,
      issuedAt: now,
      expiresAt: now + 3600,
    };
    getCurrentSessionMock.mockResolvedValue(session);

    const res = await POST(
      new Request("http://localhost/api/auth/pin/set", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin: "4242", pinConfirm: "4242" }),
      })
    );
    expect(res.status).toBe(200);
    const row = await inMemoryUserPinsPort.getByUserId(u!.userId);
    expect(row?.pinHash).toBeDefined();
    expect(row?.pinHash.startsWith("$")).toBe(true);
  });
});
