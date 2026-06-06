import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /manifest-staff.webmanifest", () => {
  it("returns staff manifest JSON with start_url /app/doctor", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("manifest+json");
    const body = (await res.json()) as { start_url?: string; id?: string };
    expect(body.start_url).toBe("/app/doctor");
    expect(body.id).toBe("/app-staff");
  });
});
