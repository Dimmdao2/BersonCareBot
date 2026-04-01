import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB pool
vi.mock("@/infra/db/client", () => ({
  getPool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  })),
}));

import { getConfigValue, getConfigBool, invalidateConfigCache, invalidateConfigKey } from "./configAdapter";
import { getPool } from "@/infra/db/client";

describe("configAdapter", () => {
  beforeEach(() => {
    invalidateConfigCache();
    vi.clearAllMocks();
  });

  it("returns env fallback when DB has no row", async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    vi.mocked(getPool).mockReturnValue(mockPool as never);

    const result = await getConfigValue("support_contact_url", "https://t.me/default_support");
    expect(result).toBe("https://t.me/default_support");
  });

  it("returns DB value over env fallback when DB has a non-empty value", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ value_json: { value: "https://t.me/prod_support" } }],
      }),
    };
    vi.mocked(getPool).mockReturnValue(mockPool as never);

    const result = await getConfigValue("support_contact_url", "https://t.me/default_support");
    expect(result).toBe("https://t.me/prod_support");
  });

  it("uses cache on second call within TTL", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ value_json: { value: "https://t.me/cached_support" } }],
      }),
    };
    vi.mocked(getPool).mockReturnValue(mockPool as never);

    await getConfigValue("support_contact_url", "fallback");
    await getConfigValue("support_contact_url", "fallback");

    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it("invalidateConfigKey clears only the specified key cache", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ value_json: { value: "some-value" } }],
      }),
    };
    vi.mocked(getPool).mockReturnValue(mockPool as never);

    await getConfigValue("support_contact_url", "fallback");
    await getConfigValue("admin_telegram_ids", "fallback2");
    expect(mockPool.query).toHaveBeenCalledTimes(2);

    invalidateConfigKey("support_contact_url");

    await getConfigValue("support_contact_url", "fallback");
    await getConfigValue("admin_telegram_ids", "fallback2"); // should use cache
    expect(mockPool.query).toHaveBeenCalledTimes(3);
  });

  it("getConfigBool returns true for boolean true in DB", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ value_json: { value: true } }],
      }),
    };
    vi.mocked(getPool).mockReturnValue(mockPool as never);

    const result = await getConfigBool("dev_mode", false);
    expect(result).toBe(true);
  });

  it("getConfigBool returns env fallback false when DB empty", async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    vi.mocked(getPool).mockReturnValue(mockPool as never);

    const result = await getConfigBool("dev_mode", false);
    expect(result).toBe(false);
  });

  it("returns env fallback when DB throws an error", async () => {
    const mockPool = {
      query: vi.fn().mockRejectedValue(new Error("DB connection failed")),
    };
    vi.mocked(getPool).mockReturnValue(mockPool as never);

    const result = await getConfigValue("support_contact_url", "https://t.me/fallback_support");
    expect(result).toBe("https://t.me/fallback_support");
  });
});
