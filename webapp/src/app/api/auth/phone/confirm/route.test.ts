import { describe, expect, it, vi } from "vitest";

const setSessionFromUserMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    auth: {
      setSessionFromUser: setSessionFromUserMock,
      confirmPhoneAuth: async (_challengeId: string, code: string) => {
        if (code === "123456") {
          return {
            ok: true as const,
            user: {
              userId: "phone:1",
              role: "client" as const,
              displayName: "+79991234567",
              phone: "+79991234567",
              bindings: {},
            },
            redirectTo: "/app/patient",
          };
        }
        return { ok: false as const, code: "invalid_code" };
      },
    },
  }),
}));

import { POST } from "./route";

describe("POST /api/auth/phone/confirm", () => {
  it("returns 400 when challengeId or code is missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/phone/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it("returns 200 and sets session when code is correct", async () => {
    setSessionFromUserMock.mockClear();
    const res = await POST(
      new Request("http://localhost/api/auth/phone/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: "test-challenge", code: "123456" }),
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.redirectTo).toBe("/app/patient");
    expect(data.role).toBe("client");
    expect(setSessionFromUserMock).toHaveBeenCalledTimes(1);
  });
});
