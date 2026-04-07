import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  env: {
    ADMIN_PHONES: "+79643805480, +79991112233",
    DOCTOR_PHONES: "+79990000002",
    ALLOWED_PHONES: "",
    ADMIN_TELEGRAM_ID: 9_001_001_001,
    DOCTOR_TELEGRAM_IDS: "9001001002 9001001003",
    ADMIN_MAX_IDS: "max-admin-1",
    DOCTOR_MAX_IDS: "max-doc-1 max-doc-2",
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

  it("returns admin when telegramId matches ADMIN_TELEGRAM_ID", () => {
    expect(resolveRoleFromEnv({ telegramId: "9001001001" })).toBe("admin");
  });

  it("returns doctor when telegramId is in DOCTOR_TELEGRAM_IDS", () => {
    expect(resolveRoleFromEnv({ telegramId: "9001001002" })).toBe("doctor");
    expect(resolveRoleFromEnv({ telegramId: "9001001003" })).toBe("doctor");
  });

  it("returns client when telegramId is not in admin/doctor lists", () => {
    expect(resolveRoleFromEnv({ telegramId: "111222333" })).toBe("client");
  });

  it("returns admin/doctor by maxId lists", () => {
    expect(resolveRoleFromEnv({ maxId: "max-admin-1" })).toBe("admin");
    expect(resolveRoleFromEnv({ maxId: "max-doc-1" })).toBe("doctor");
    expect(resolveRoleFromEnv({ maxId: "max-doc-2" })).toBe("doctor");
  });

  it("admin telegram wins over doctor phone", () => {
    expect(
      resolveRoleFromEnv({
        telegramId: "9001001001",
        phone: "+79990000002",
      }),
    ).toBe("admin");
  });
});
