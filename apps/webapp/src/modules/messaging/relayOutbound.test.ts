import { describe, expect, it, vi } from "vitest";

describe("maybeRelayOutbound", () => {
  it("resolves without throwing when relay is noop", async () => {
    const { maybeRelayOutbound } = await import("./relayOutbound");
    await expect(maybeRelayOutbound({ kind: "patient", text: "x" })).resolves.toBeUndefined();
  });
});
