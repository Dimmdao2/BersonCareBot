import { describe, expect, it } from "vitest";
import { isPlatformUserUuid } from "./isPlatformUserUuid";

describe("isPlatformUserUuid", () => {
  it("accepts lowercase UUID", () => {
    expect(isPlatformUserUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects legacy tg id", () => {
    expect(isPlatformUserUuid("tg:12345")).toBe(false);
  });
});
