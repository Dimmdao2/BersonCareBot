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

describe("createSystemSettingsService web_push_vapid merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges previous privateKey when patch sends empty privateKey", async () => {
    const upsert = vi.fn().mockResolvedValue({
      key: "web_push_vapid",
      scope: "admin",
      valueJson: {
        value: {
          publicKey: "newpub",
          privateKey: "kept-from-db",
        },
      },
      updatedAt: "",
      updatedBy: "admin",
    });
    const getByKey = vi.fn().mockResolvedValue({
      key: "web_push_vapid",
      scope: "admin",
      valueJson: {
        value: {
          publicKey: "oldpub",
          privateKey: "kept-from-db",
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
      "web_push_vapid",
      "admin",
      { value: { publicKey: "newpub", privateKey: "" } },
      "admin",
    );

    expect(upsert).toHaveBeenCalledWith(
      "web_push_vapid",
      "admin",
      expect.objectContaining({
        value: expect.objectContaining({ publicKey: "newpub", privateKey: "kept-from-db" }),
      }),
      "admin",
    );
  });
});
