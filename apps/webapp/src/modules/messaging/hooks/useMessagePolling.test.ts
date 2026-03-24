import { describe, expect, it } from "vitest";

describe("useMessagePolling", () => {
  it("exports hook function", async () => {
    const mod = await import("./useMessagePolling");
    expect(typeof mod.useMessagePolling).toBe("function");
  });
});
