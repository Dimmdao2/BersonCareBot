import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/auth/oauth/start", () => {
  it("returns 501 for google (stub)", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google" }),
      })
    );
    expect(res.status).toBe(501);
    const data = (await res.json()) as { ok: boolean; error: string };
    expect(data.ok).toBe(false);
    expect(data.error).toBe("oauth_disabled");
  });

  it("returns 501 for yandex when env empty (test)", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/oauth/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "yandex" }),
      })
    );
    expect(res.status).toBe(501);
  });
});
