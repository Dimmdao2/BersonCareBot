import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadPatientTelegramUsernameMock } = vi.hoisted(() => ({
  loadPatientTelegramUsernameMock: vi.fn(),
}));

vi.mock("@/infra/repos/pgPatientTelegramUsernameMention", () => ({
  loadPatientTelegramUsername: loadPatientTelegramUsernameMock,
}));

import { resolvePatientTelegramUsernameMention } from "./resolvePatientTelegramUsernameMention";

describe("resolvePatientTelegramUsernameMention", () => {
  beforeEach(() => {
    loadPatientTelegramUsernameMock.mockReset();
  });

  it("formats loaded telegram username as mention", async () => {
    loadPatientTelegramUsernameMock.mockResolvedValue("patient_user");

    await expect(resolvePatientTelegramUsernameMention("user-1")).resolves.toBe("@patient_user");
  });

  it("returns null when lookup fails", async () => {
    loadPatientTelegramUsernameMock.mockRejectedValue(new Error("db down"));

    await expect(resolvePatientTelegramUsernameMention("user-1")).resolves.toBeNull();
  });
});
