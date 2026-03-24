import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/auth/oauth/callback", () => {
  it("redirects when OAuth is not configured (stub)", async () => {
    const res = await GET(
      new Request("http://localhost/api/auth/oauth/callback?code=test-code&state=xyz")
    );
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const loc = res.headers.get("location");
    expect(loc).toBeTruthy();
    expect(loc).toMatch(/oauth=/);
  });
});
