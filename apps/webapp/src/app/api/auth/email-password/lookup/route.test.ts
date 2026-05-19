import { describe, expect, it, vi, beforeEach } from "vitest";

const resolveAuthState = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    emailPasswordLookup: { resolveAuthState },
  }),
}));

import { POST } from "./route";

describe("POST /api/auth/email-password/lookup", () => {
  beforeEach(() => {
    resolveAuthState.mockReset();
  });

  it("returns public state for email", async () => {
    resolveAuthState.mockResolvedValueOnce({
      kind: "needs_email_setup",
      userId: "u1",
    });

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, state: "needs_email_setup" });
  });
});
