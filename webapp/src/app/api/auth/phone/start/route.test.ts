import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/auth/phone/start", () => {
  it("returns 400 when phone is missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("phone_required");
  });

  it("returns 200 with challengeId for valid phone", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "+79991234567" }),
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.challengeId).toBe("string");
    expect(data.challengeId.length).toBeGreaterThan(0);
    expect(data.retryAfterSeconds).toBe(60);
  });
});
