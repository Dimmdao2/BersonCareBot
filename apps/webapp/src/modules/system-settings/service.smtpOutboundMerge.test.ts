import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SystemSettingsPort } from "./ports";

vi.mock("./syncToIntegrator", () => ({
  normalizeStoredValueJsonForIntegratorSync: (v: unknown) => v,
  syncSettingToIntegrator: vi.fn(),
}));

vi.mock("./configAdapter", () => ({
  invalidateConfigKey: vi.fn(),
}));

import { createSystemSettingsService } from "./service";

describe("createSystemSettingsService smtp_outbound merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges previous password when patch sends empty password", async () => {
    const upsert = vi.fn().mockResolvedValue({
      key: "smtp_outbound",
      scope: "admin",
      valueJson: {
        value: {
          host: "smtp.example.com",
          port: 587,
          secure: false,
          user: "u",
          password: "kept-from-db",
          from: "a@b.com",
        },
      },
      updatedAt: "",
      updatedBy: "admin",
    });
    const getByKey = vi.fn().mockResolvedValue({
      key: "smtp_outbound",
      scope: "admin",
      valueJson: {
        value: {
          host: "smtp.example.com",
          port: 587,
          secure: false,
          user: "u",
          password: "kept-from-db",
          from: "a@b.com",
        },
      },
      updatedAt: "",
      updatedBy: null,
    });

    const port: SystemSettingsPort = {
      getByKey,
      getByScope: vi.fn(),
      upsertManyInTransaction: vi.fn(),
      upsert,
    };

    const svc = createSystemSettingsService(port);
    await svc.updateSetting(
      "smtp_outbound",
      "admin",
      { value: { host: "smtp.example.com", port: 587, secure: false, user: "u", password: "", from: "a@b.com" } },
      "admin",
    );

    expect(upsert).toHaveBeenCalledWith(
      "smtp_outbound",
      "admin",
      expect.objectContaining({
        value: expect.objectContaining({ password: "kept-from-db" }),
      }),
      "admin",
    );
  });
});
