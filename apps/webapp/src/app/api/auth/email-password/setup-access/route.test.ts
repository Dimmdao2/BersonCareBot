import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveAuthStateMock = vi.hoisted(() => vi.fn());
const startEmailChallengeMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    emailPasswordLookup: { resolveAuthState: resolveAuthStateMock },
  }),
}));

vi.mock("@/modules/auth/emailAuth", async () => {
  const actual = await vi.importActual<typeof import("@/modules/auth/emailAuth")>("@/modules/auth/emailAuth");
  return {
    ...actual,
    startEmailChallenge: (...args: unknown[]) => startEmailChallengeMock(...args),
  };
});

import * as authChannelPolicy from "@/modules/auth/authChannelPolicy";
import { POST } from "./route";

function request(email: string): Request {
  return new Request("http://localhost/api/auth/email-password/setup-access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("POST /api/auth/email-password/setup-access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a disabled email channel before account lookup or challenge creation", async () => {
    const policy = vi.spyOn(authChannelPolicy, "isAuthChannelEnabled").mockResolvedValue(false);
    try {
      const response = await POST(request("known@example.com"));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ ok: false, error: "auth_channel_disabled" });
      expect(resolveAuthStateMock).not.toHaveBeenCalled();
      expect(startEmailChallengeMock).not.toHaveBeenCalled();
    } finally {
      policy.mockRestore();
    }
  });

  it("keeps the configured provider path available when the channel is enabled", async () => {
    const policy = vi.spyOn(authChannelPolicy, "isAuthChannelEnabled").mockResolvedValue(true);
    resolveAuthStateMock.mockResolvedValueOnce({
      kind: "needs_email_setup",
      userId: "11111111-1111-4111-8111-111111111111",
    });
    startEmailChallengeMock.mockResolvedValueOnce({
      ok: true,
      challengeId: "22222222-2222-4222-8222-222222222222",
      retryAfterSeconds: 60,
    });
    try {
      const response = await POST(request("Known@Example.com"));

      expect(response.status).toBe(200);
      expect(startEmailChallengeMock).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        "known@example.com",
        "password_setup",
      );
    } finally {
      policy.mockRestore();
    }
  });
});
