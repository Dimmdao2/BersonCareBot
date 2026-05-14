import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("proxy (Next convention)", () => {
  it("returns next without redirect for /app/patient without ctx", () => {
    const req = new NextRequest("http://localhost/app/patient/today?q=1");
    const res = proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
