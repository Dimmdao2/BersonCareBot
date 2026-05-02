/**
 * E2E (in-process): doctor messaging entrypoints are exported and callable.
 */
import { describe, expect, it } from "vitest";

describe("doctor actions e2e (in-process)", () => {
  it("doctor support ensure route is exported and callable", async () => {
    const route = await import("@/app/api/doctor/messages/conversations/ensure/route");
    expect(typeof route.POST).toBe("function");
  });
});
