import { describe, expect, it } from "vitest";
import { getCurrentUser } from "./service";
import type { AppSession } from "@/shared/types/session";

describe("users service", () => {
  it("returns null for null session", () => {
    expect(getCurrentUser(null)).toBeNull();
  });

  it("returns user from session", () => {
    const session: AppSession = {
      user: {
        userId: "u1",
        role: "client",
        displayName: "Test",
        bindings: {},
      },
      issuedAt: 0,
      expiresAt: 1,
    };
    expect(getCurrentUser(session)).toEqual(session.user);
  });
});
