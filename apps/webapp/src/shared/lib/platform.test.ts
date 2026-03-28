import { describe, expect, it } from "vitest";
import {
  PLATFORM_COOKIE_MAX_AGE,
  PLATFORM_COOKIE_NAME,
  serializePlatformBotCookie,
  serializePlatformCookie,
} from "@/shared/lib/platform";

describe("serializePlatformCookie", () => {
  it("serializes standalone without Secure when not https", () => {
    const s = serializePlatformCookie("standalone", { secure: false });
    expect(s).toContain(`${PLATFORM_COOKIE_NAME}=standalone`);
    expect(s).toContain("Path=/");
    expect(s).toContain(`Max-Age=${PLATFORM_COOKIE_MAX_AGE}`);
    expect(s).toContain("SameSite=Lax");
    expect(s).not.toContain("Secure");
  });

  it("serializes bot with SameSite=None and Secure in production-like mode", () => {
    const s = serializePlatformCookie("bot", { secure: true });
    expect(s).toContain(`${PLATFORM_COOKIE_NAME}=bot`);
    expect(s).toContain("SameSite=None");
    expect(s).toContain("Secure");
  });

  it("serializePlatformBotCookie matches bot + secure branch", () => {
    expect(serializePlatformBotCookie({ secure: true })).toBe(serializePlatformCookie("bot", { secure: true }));
  });
});
