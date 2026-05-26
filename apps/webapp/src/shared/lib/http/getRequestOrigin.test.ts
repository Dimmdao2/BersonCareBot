import { describe, expect, it } from "vitest";
import { getRequestOrigin } from "./getRequestOrigin";

describe("getRequestOrigin", () => {
  it("uses Host header", () => {
    const req = new Request("http://ignored/api/auth/logout", {
      headers: { host: "localhost:5200" },
    });
    expect(getRequestOrigin(req)).toBe("http://localhost:5200");
  });

  it("prefers x-forwarded-* when present", () => {
    const req = new Request("http://127.0.0.1/api/auth/logout", {
      headers: {
        host: "127.0.0.1:5200",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "bersoncare.example",
      },
    });
    expect(getRequestOrigin(req)).toBe("https://bersoncare.example");
  });
});
