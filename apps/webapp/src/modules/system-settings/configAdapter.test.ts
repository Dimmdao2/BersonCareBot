import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: vi.fn().mockResolvedValue({ rows: [] }),
}));

import {
  getConfigValue,
  getConfigBool,
  getConfigPositiveInt,
  getFreshServerRuntimeTokenList,
  getServerRuntimeTokenList,
  invalidateConfigCache,
  invalidateConfigKey,
} from "./configAdapter";
import { runWebappPgText } from "@/infra/db/runWebappSql";

describe("configAdapter", () => {
  beforeEach(() => {
    invalidateConfigCache();
    vi.clearAllMocks();
    vi.mocked(runWebappPgText).mockResolvedValue({ rows: [] });
  });

  it("returns env fallback when DB has no row", async () => {
    const result = await getConfigValue("support_contact_url", "https://t.me/default_support");
    expect(result).toBe("https://t.me/default_support");
  });

  it("returns DB value over env fallback when DB has a non-empty value", async () => {
    vi.mocked(runWebappPgText).mockResolvedValue({
      rows: [{ scope: "admin", value_json: { value: "https://t.me/prod_support" } }],
    });

    const result = await getConfigValue("support_contact_url", "https://t.me/default_support");
    expect(result).toBe("https://t.me/prod_support");
  });

  it("uses cache on second call within TTL", async () => {
    vi.mocked(runWebappPgText).mockResolvedValue({
      rows: [{ scope: "admin", value_json: { value: "https://t.me/cached_support" } }],
    });

    await getConfigValue("support_contact_url", "fallback");
    await getConfigValue("support_contact_url", "fallback");

    expect(runWebappPgText).toHaveBeenCalledTimes(1);
  });

  it("invalidateConfigKey clears only the specified key cache", async () => {
    vi.mocked(runWebappPgText).mockResolvedValue({
      rows: [{ scope: "admin", value_json: { value: "some-value" } }],
    });

    await getConfigValue("support_contact_url", "fallback");
    await getConfigValue("admin_telegram_ids", "fallback2");
    expect(runWebappPgText).toHaveBeenCalledTimes(2);

    invalidateConfigKey("support_contact_url");

    await getConfigValue("support_contact_url", "fallback");
    await getConfigValue("admin_telegram_ids", "fallback2");
    expect(runWebappPgText).toHaveBeenCalledTimes(3);
  });

  it("getConfigBool returns true for boolean true in DB", async () => {
    vi.mocked(runWebappPgText).mockResolvedValue({
      rows: [{ scope: "admin", value_json: { value: true } }],
    });

    const result = await getConfigBool("dev_mode", false);
    expect(result).toBe(true);
  });

  it("getConfigBool returns env fallback false when DB empty", async () => {
    const result = await getConfigBool("dev_mode", false);
    expect(result).toBe(false);
  });

  it("returns env fallback when DB throws an error", async () => {
    vi.mocked(runWebappPgText).mockRejectedValue(new Error("DB connection failed"));

    const result = await getConfigValue("support_contact_url", "https://t.me/fallback_support");
    expect(result).toBe("https://t.me/fallback_support");
  });

  it("getConfigPositiveInt clamps to min/max", async () => {
    vi.mocked(runWebappPgText).mockResolvedValue({
      rows: [{ scope: "admin", value_json: { value: 30 } }],
    });

    const r = await getConfigPositiveInt("video_presign_ttl_seconds", 3600, { min: 60, max: 604800 });
    expect(r).toBe(60);
  });

  it("getConfigPositiveInt returns default on NaN from DB", async () => {
    vi.mocked(runWebappPgText).mockResolvedValue({
      rows: [{ scope: "admin", value_json: { value: "not-a-number" } }],
    });

    const r = await getConfigPositiveInt("video_presign_ttl_seconds", 3600, { min: 60, max: 604800 });
    expect(r).toBe(3600);
  });

  it("caches closed server token lists and preserves authoritative JSON arrays", async () => {
    vi.mocked(runWebappPgText).mockResolvedValue({
      rows: [{
        key: "doctor_phones",
        scope: "admin",
        organization_id: null,
        audience: "server",
        value_json: { value: ["+75550000001"] },
      }],
    });

    await expect(getServerRuntimeTokenList("doctor_phones", "env-doctor")).resolves.toBe(
      '["+75550000001"]',
    );
    await expect(getServerRuntimeTokenList("doctor_phones", "env-doctor")).resolves.toBe(
      '["+75550000001"]',
    );
    expect(runWebappPgText).toHaveBeenCalledTimes(1);

    invalidateConfigKey("doctor_phones");
    await getServerRuntimeTokenList("doctor_phones", "env-doctor");
    expect(runWebappPgText).toHaveBeenCalledTimes(2);
  });

  it("bypasses the cache and fails closed for email-admin authorization reads", async () => {
    vi.mocked(runWebappPgText)
      .mockResolvedValueOnce({
        rows: [{
          key: "admin_emails",
          scope: "admin",
          organization_id: null,
          audience: "server",
          value_json: { value: ["dimmdao@gmail.com"] },
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("database unavailable"));

    await expect(getFreshServerRuntimeTokenList("admin_emails")).resolves.toBe(
      '["dimmdao@gmail.com"]',
    );
    await expect(getFreshServerRuntimeTokenList("admin_emails")).resolves.toBe("");
    await expect(getFreshServerRuntimeTokenList("admin_emails")).rejects.toThrow("database unavailable");
    expect(runWebappPgText).toHaveBeenCalledTimes(3);
  });
});
