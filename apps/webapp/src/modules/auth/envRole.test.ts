import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  env: {
    ADMIN_PHONES: "+79643805480, +79991112233",
    DOCTOR_PHONES: "+79990000002",
    ALLOWED_PHONES: "",
  },
}));

import { resolveRoleFromEnv } from "./envRole";

describe("resolveRoleFromEnv", () => {
  it("returns admin when phone matches ADMIN_PHONES (normalized)", () => {
    expect(resolveRoleFromEnv({ phone: "+79643805480" })).toBe("admin");
    expect(resolveRoleFromEnv({ phone: "89643805480" })).toBe("admin");
  });

  it("returns doctor when phone matches DOCTOR_PHONES and not admin", () => {
    expect(resolveRoleFromEnv({ phone: "+79990000002" })).toBe("doctor");
  });

  it("returns client without phone or when not listed", () => {
    expect(resolveRoleFromEnv({ phone: undefined })).toBe("client");
    expect(resolveRoleFromEnv({ phone: "+70000000000" })).toBe("client");
  });
});
